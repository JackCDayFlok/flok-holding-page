/* ==========================================================================
   REGISTER INTEREST PAGE
   Tabs, worker form validation, conditional fields and submission.
   Depends on js/form-options.js (LOCATIONS, WORK_TYPES).
   ========================================================================== */

(function () {
  "use strict";

  // PREVIEW MODE: submissions are simulated and nothing is saved.
  // This MUST be set to false, with the real API call in place
  // (WORKER_INTEREST_ENDPOINT below), before the page goes live.
  const PREVIEW_MODE = true;

  // TODO: Set to the confirmed AWS endpoint. While this is empty and
  // PREVIEW_MODE is false, submissions fail rather than pretend to succeed.
  const WORKER_INTEREST_ENDPOINT = "";

  const OTHER_LOCATION = "Other";
  const CV_MAX_BYTES = 10 * 1024 * 1024; // 10MB
  const CV_MIME_TYPE = "application/pdf";
  const SUBMIT_FAILED_MESSAGE = "Something went wrong and your details weren't sent. Please try again.";

  /* ------------------------------------------------------------------------
     Tabs
     ------------------------------------------------------------------------ */

  function initTabs() {
    const tabs = Array.from(document.querySelectorAll(".interest-tab"));

    function selectTab(tab) {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
      });
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => selectTab(tab));
      tab.addEventListener("keydown", (e) => {
        let next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs[tabs.length - 1];
        if (!next) return;
        e.preventDefault();
        selectTab(next);
        next.focus();
      });
    });
  }

  /* ------------------------------------------------------------------------
     UK phone helpers (same rules as contact-us.html)
     ------------------------------------------------------------------------ */

  function normalizeUkPhone(raw) {
    let s = (raw || "").trim();
    s = s.replace(/[\s()\- ]/g, ""); // spaces, brackets, dashes, NBSP
    if (s.startsWith("0044")) s = "+44" + s.slice(4);
    return s;
  }

  // UK only, accepts:
  // - 0 + 10 digits (11 total): 07123456789, 02079460000
  // - +44 + 10 digits (no leading 0 after +44): +447123456789, +442079460000
  // - 10 digits with no prefix (missing trunk 0): 7123456789, 2079460000
  // Empty values are handled by the required check in the phone validator.
  function isValidUkPhone(raw) {
    const s = normalizeUkPhone(raw);

    if (/^0[1-9]\d{9}$/.test(s)) return true;
    if (/^\+44[1-9]\d{9}$/.test(s)) return true;
    if (/^[1-9]\d{9}$/.test(s)) return true; // no 0, no +44

    return false;
  }

  // Optional: choose ONE normal form to store/display
  // - "national": force 0XXXXXXXXXX
  // - "e164": force +44XXXXXXXXXX
  function toUkFormat(raw, mode = "national") {
    const s = normalizeUkPhone(raw);
    if (s === "") return "";

    if (/^0[1-9]\d{9}$/.test(s)) {
      return mode === "e164" ? "+44" + s.slice(1) : s;
    }
    if (/^\+44[1-9]\d{9}$/.test(s)) {
      return mode === "national" ? "0" + s.slice(3) : s;
    }
    if (/^[1-9]\d{9}$/.test(s)) {
      return mode === "e164" ? "+44" + s : "0" + s;
    }
    return raw; // leave as-is if weird
  }

  /* ------------------------------------------------------------------------
     Validation
     ------------------------------------------------------------------------ */

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const EMAIL_MESSAGE = "Please enter a valid email address, for example name@example.com.";

  // { fieldName: (value, formData) => errorMessage or "" }
  // Declared in DOM order so the first error found is the first on screen.
  // marketingEmail and marketingSms are optional and deliberately have no validator.
  const validators = {
    firstName: (value) => (value ? "" : "Please enter your first name."),

    lastName: (value) => (value ? "" : "Please enter your last name."),

    email: (value) => (value && EMAIL_PATTERN.test(value) ? "" : EMAIL_MESSAGE),

    phone: (value) => {
      if (!value) return "Please enter your phone number.";
      if (!isValidUkPhone(value)) return "Please enter a valid UK phone number, for example 07123 456789.";
      return "";
    },

    location: (value) => (value ? "" : "Please select your location."),

    locationOther: (value, formData) => {
      if (formData.location !== OTHER_LOCATION) return "";
      return value ? "" : "Please enter your location.";
    },

    workType: (value) => (value ? "" : "Please choose a work type."),

    cv: (file) => {
      if (!file) return "Please upload your CV.";
      if (file.type !== CV_MIME_TYPE) return "Please upload a PDF file.";
      if (file.size > CV_MAX_BYTES) return "That file is over 10MB. Please upload a smaller PDF.";
      return "";
    },

    agreePrivacy: (checked) => (checked ? "" : "Please confirm you have read the Privacy Policy."),
  };

  function readFormData(form) {
    const formData = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === "checkbox") formData[el.name] = el.checked;
      else if (el.type === "file") formData[el.name] = el.files[0] || null;
      else formData[el.name] = el.value.trim();
    });
    return formData;
  }

  // Fields inside a hidden container (e.g. "Your location" when Other isn't
  // selected, or the other tab's panel) are never validated.
  function isFieldActive(field) {
    return !field.closest("[hidden]");
  }

  function setFieldError(form, name, message) {
    const field = form.elements[name];
    const errorEl = document.getElementById(name + "-error");

    errorEl.textContent = message;
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function validateField(form, name) {
    const formData = readFormData(form);
    const message = isFieldActive(form.elements[name]) ? validators[name](formData[name], formData) : "";
    setFieldError(form, name, message);
    return message;
  }

  /* ------------------------------------------------------------------------
     Conditional "Other" location field
     ------------------------------------------------------------------------ */

  function toggleLocationOther(form) {
    const isOther = form.elements.location.value === OTHER_LOCATION;
    const wrapper = document.getElementById("locationOtherField");

    wrapper.hidden = !isOther;
    form.elements.locationOther.required = isOther;
    if (!isOther) setFieldError(form, "locationOther", "");
  }

  /* ------------------------------------------------------------------------
     CV attached state
     ------------------------------------------------------------------------ */

  function initCvField(form) {
    const input = form.elements.cv;
    const attached = document.getElementById("cvAttached");
    const nameEl = document.getElementById("cvName");
    const replaceBtn = document.getElementById("cvReplace");
    let attachedFile = null;

    function render() {
      const isAttached = attachedFile !== null;
      attached.hidden = !isAttached;
      input.classList.toggle("is-attached", isAttached);
      // The visually hidden input shouldn't be a separate, invisible tab stop.
      input.tabIndex = isAttached ? -1 : 0;
      nameEl.textContent = isAttached ? attachedFile.name : "";
    }

    function restoreAttachedFile() {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(attachedFile);
        input.files = transfer.files;
      } catch (err) {
        // Browsers without DataTransfer support: treat the CV as removed.
        attachedFile = null;
      }
    }

    // Called on every change to the file input.
    function update() {
      const file = input.files[0] || null;

      if (!file && attachedFile) {
        // Picker was cancelled after "Replace": some browsers clear the input,
        // so put the previously attached CV back.
        restoreAttachedFile();
      } else {
        attachedFile = file && !validators.cv(file) ? file : null;
      }
      render();
    }

    replaceBtn.addEventListener("click", () => input.click());

    return { update };
  }

  /* ------------------------------------------------------------------------
     Submission
     ------------------------------------------------------------------------ */

  async function submitWorkerInterest(payload) {
    // TODO: The CV is not part of this payload. It will be uploaded separately
    // via a pre-signed S3 URL returned by the backend, then linked to this
    // submission.
    if (PREVIEW_MODE) {
      console.log("[PREVIEW] submitWorkerInterest (simulated, not sent)", payload);
      return new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!WORKER_INTEREST_ENDPOINT) {
      throw new Error("WORKER_INTEREST_ENDPOINT is not configured.");
    }

    // TODO: Confirm request shape and auth with the AWS endpoint.
    const response = await fetch(WORKER_INTEREST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Submission failed with status " + response.status);
  }

  function buildPayload(formData) {
    const payload = {
      formType: "worker",
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: toUkFormat(formData.phone, "e164"),
      location: formData.location,
      workType: formData.workType,
      marketingEmail: formData.marketingEmail === true,
      marketingSms: formData.marketingSms === true,
      privacyConsent: formData.agreePrivacy === true,
    };
    if (formData.location === OTHER_LOCATION) payload.locationOther = formData.locationOther;
    return payload;
  }

  function showConfirmation(panel, firstName) {
    const confirmation = document.createElement("div");
    confirmation.className = "interest-confirmation";

    const heading = document.createElement("h2");
    heading.textContent = "You've registered your interest";
    heading.tabIndex = -1;

    const text = document.createElement("p");
    text.textContent =
      (firstName ? "Thanks, " + firstName + ". " : "Thanks. ") +
      "This isn't a full Flok account yet. We'll be in touch with next steps when access opens.";

    confirmation.append(heading, text);
    // Replace the whole worker panel (heading, intro and form) with the confirmation.
    panel.replaceChildren(confirmation);
    heading.focus();
  }

  /* ------------------------------------------------------------------------
     Worker form wiring
     ------------------------------------------------------------------------ */

  function populateSelect(select, options) {
    options.forEach((value) => select.add(new Option(value, value)));
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function initWorkerForm() {
    const form = document.getElementById("workerForm");
    if (!form) return;

    const panel = document.getElementById("panel-worker");
    const submitBtn = form.querySelector(".interest-submit");
    const formError = document.getElementById("workerForm-error");
    const submitLabel = submitBtn.textContent;
    const cvField = initCvField(form);
    let isSubmitting = false;

    populateSelect(form.elements.location, [...window.LOCATIONS, OTHER_LOCATION]);
    populateSelect(form.elements.workType, window.WORK_TYPES);

    // One handler for both "input" and "change". Typing never shows a new
    // error; it only re-validates a field that is already showing one, so the
    // error clears as soon as the value is valid. Selects, the CV and the
    // checkbox are validated when their value is committed.
    function handleFieldChange(e) {
      const name = e.target.name;
      if (name === "cv" && e.type === "change") cvField.update();
      if (!validators[name]) return;

      if (name === "location") toggleLocationOther(form);

      const isInvalid = e.target.getAttribute("aria-invalid") === "true";
      const isTextEntry = e.target.tagName === "INPUT" && !["checkbox", "file"].includes(e.target.type);
      if (isInvalid || (e.type === "change" && !isTextEntry)) validateField(form, name);
    }

    function handleFieldBlur(e) {
      const name = e.target.name;
      if (!validators[name]) return;
      // Ignore blur caused by the window losing focus (e.g. the file picker opening).
      if (!document.hasFocus()) return;
      validateField(form, name);
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (isSubmitting) return;
      formError.textContent = "";

      const formData = readFormData(form);
      let firstInvalid = null;

      Object.keys(validators).forEach((name) => {
        const field = form.elements[name];
        const message = isFieldActive(field) ? validators[name](formData[name], formData) : "";
        setFieldError(form, name, message);
        if (message && !firstInvalid) firstInvalid = field;
      });

      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        firstInvalid.focus({ preventScroll: true });
        return;
      }

      isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      form.setAttribute("aria-busy", "true");

      try {
        await submitWorkerInterest(buildPayload(formData));
        showConfirmation(panel, formData.firstName);
      } catch (err) {
        console.error(err);
        formError.textContent = SUBMIT_FAILED_MESSAGE;
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        form.removeAttribute("aria-busy");
        isSubmitting = false;
      }
    }

    form.addEventListener("input", handleFieldChange);
    form.addEventListener("change", handleFieldChange);
    form.addEventListener("focusout", handleFieldBlur);
    form.addEventListener("submit", handleSubmit);
  }

  function initPreviewNotice() {
    const notice = document.getElementById("previewNotice");
    if (notice) notice.hidden = !PREVIEW_MODE;
  }

  initPreviewNotice();
  initTabs();
  initWorkerForm();
})();
