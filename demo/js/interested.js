/* ==========================================================================
   REGISTER INTEREST PAGE
   Tabs, worker form validation, conditional fields and submission.
   Depends on js/form-options.js (LOCATIONS, WORK_TYPES).
   ========================================================================== */

(function () {
  "use strict";

  const OTHER_LOCATION = "Other";
  const CV_MAX_BYTES = 10 * 1024 * 1024; // 10MB
  const CV_MIME_TYPE = "application/pdf";

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

  /* ------------------------------------------------------------------------
     Validation
     ------------------------------------------------------------------------ */

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // { fieldName: (value, formData) => errorMessage or "" }
  // Declared in DOM order so the first error found is the first on screen.
  const validators = {
    firstName: (value) => (value ? "" : "Please enter your first name."),

    lastName: (value) => (value ? "" : "Please enter your last name."),

    email: (value) => {
      if (!value) return "Please enter your email address.";
      if (!EMAIL_PATTERN.test(value)) return "Please enter a valid email address, like name@example.com.";
      return "";
    },

    phone: (value) => {
      if (!value) return "Please enter your phone number.";
      if (!isValidUkPhone(value)) return "Please enter a valid UK phone number, like 07123 456789.";
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
      if (file.type !== CV_MIME_TYPE) return "Your CV must be a PDF file.";
      if (file.size > CV_MAX_BYTES) return "Your CV must be 10MB or smaller.";
      return "";
    },

    agreePrivacy: (checked) => (checked ? "" : "Please agree to the Privacy Policy to continue."),
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

  function setFieldError(form, name, message) {
    const field = form.elements[name];
    const errorEl = document.getElementById(name + "-error");

    errorEl.textContent = message;
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function validateField(form, name) {
    const formData = readFormData(form);
    const message = validators[name](formData[name], formData);
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
     Submission (stub)
     ------------------------------------------------------------------------ */

  async function submitWorkerInterest(payload) {
    // TODO: POST the payload to the AWS endpoint once it has been confirmed.
    // TODO: The CV is not part of this payload. It will be uploaded separately
    // via a pre-signed S3 URL returned by the backend, then linked to this
    // submission.
    console.log("submitWorkerInterest", payload);
    return new Promise((resolve) => setTimeout(resolve, 800));
  }

  function buildPayload(formData) {
    const payload = {
      formType: "worker",
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: normalizeUkPhone(formData.phone),
      location: formData.location,
      workType: formData.workType,
      privacyConsent: formData.agreePrivacy === true,
    };
    if (formData.location === OTHER_LOCATION) payload.locationOther = formData.locationOther;
    return payload;
  }

  function showConfirmation(form, firstName) {
    const confirmation = document.createElement("div");
    confirmation.className = "interest-confirmation";

    const heading = document.createElement("h2");
    heading.textContent = "You've registered your interest";
    heading.tabIndex = -1;

    const text = document.createElement("p");
    text.textContent =
      "Thanks, " + firstName + ". This isn't a full Flok account yet. " +
      "We'll be in touch with next steps when access opens.";

    confirmation.append(heading, text);
    form.replaceWith(confirmation);
    heading.focus();
  }

  /* ------------------------------------------------------------------------
     Worker form wiring
     ------------------------------------------------------------------------ */

  function populateSelect(select, options) {
    options.forEach((value) => select.add(new Option(value, value)));
  }

  function initWorkerForm() {
    const form = document.getElementById("workerForm");
    if (!form) return;

    const submitBtn = form.querySelector(".interest-submit");
    const formError = document.getElementById("workerForm-error");
    const submitLabel = submitBtn.textContent;

    populateSelect(form.elements.location, [...window.LOCATIONS, OTHER_LOCATION]);
    populateSelect(form.elements.workType, window.WORK_TYPES);

    // One handler for both "input" and "change". Committed changes (selects,
    // file, checkbox, text on blur) validate; typing only re-validates a field
    // that is already showing an error, so it clears as soon as it's valid.
    function handleFieldChange(e) {
      const name = e.target.name;
      if (!validators[name]) return;

      if (name === "location") toggleLocationOther(form);

      const isInvalid = e.target.getAttribute("aria-invalid") === "true";
      if (e.type === "change" || isInvalid) validateField(form, name);
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
      formError.textContent = "";

      const formData = readFormData(form);
      let firstInvalid = null;

      Object.keys(validators).forEach((name) => {
        const message = validators[name](formData[name], formData);
        setFieldError(form, name, message);
        if (message && !firstInvalid) firstInvalid = form.elements[name];
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      form.setAttribute("aria-busy", "true");

      try {
        await submitWorkerInterest(buildPayload(formData));
        showConfirmation(form, formData.firstName);
      } catch (err) {
        console.error(err);
        formError.textContent = "Sorry, something went wrong. Please try again.";
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        form.removeAttribute("aria-busy");
      }
    }

    form.addEventListener("input", handleFieldChange);
    form.addEventListener("change", handleFieldChange);
    form.addEventListener("focusout", handleFieldBlur);
    form.addEventListener("submit", handleSubmit);
  }

  initTabs();
  initWorkerForm();
})();
