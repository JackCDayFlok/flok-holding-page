/* ==========================================================================
   REGISTER INTEREST PAGE
   Tabs, shared form engine (validation, conditional fields, submission) and
   the worker and employer forms built on it.
   Depends on js/form-options.js (LOCATIONS, WORK_TYPES, BUSINESS_TYPES).
   ========================================================================== */

(function () {
  "use strict";

  // PREVIEW MODE: submissions are simulated and nothing is saved.
  // This MUST be set to false, with the real API calls in place
  // (the *_INTEREST_ENDPOINT constants below), before the page goes live.
  const PREVIEW_MODE = true;

  // Shows "Create your venue account" on the employer confirmation.
  // This MUST stay false until Jack confirms the app's employer sign-up
  // journey is ready.
  const ENABLE_VENUE_SIGNUP_LINK = false;

  // TODO: Set to the confirmed AWS endpoints. While an endpoint is empty and
  // PREVIEW_MODE is false, that form's submissions fail rather than pretend to succeed.
  const WORKER_INTEREST_ENDPOINT = "";
  const EMPLOYER_INTEREST_ENDPOINT = "";

  const OTHER = "Other";
  const CV_MAX_BYTES = 10 * 1024 * 1024; // 10MB
  const CV_MIME_TYPE = "application/pdf";
  const SUBMIT_FAILED_MESSAGE = "Something went wrong and your details weren't sent. Please try again.";

  /* ------------------------------------------------------------------------
     Tabs
     ------------------------------------------------------------------------ */

  // Panels are only hidden, never re-rendered, so each form keeps what was entered.
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
  // Empty values are handled by the required check in the phone validators.
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
     Website helper
     ------------------------------------------------------------------------ */

  const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

  // Returns the website with https:// added if no scheme was typed, or null if
  // it isn't a plausible website. "example.co.uk" -> "https://example.co.uk".
  function normalizeWebsite(raw) {
    const value = (raw || "").trim();
    if (!value || /\s/.test(value)) return null;

    const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
    try {
      const url = new URL(withScheme);
      // Reject "name@example.com" style input, which URL parses as user@host.
      if (url.username || url.password) return null;
      return HOSTNAME_PATTERN.test(url.hostname) ? withScheme : null;
    } catch (err) {
      return null;
    }
  }

  /* ------------------------------------------------------------------------
     Reusable validation rules
     Each returns a validator: (value, formData) => errorMessage or "".
     ------------------------------------------------------------------------ */

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const rules = {
    required: (message) => (value) => (value ? "" : message),

    email: () => (value) =>
      value && EMAIL_PATTERN.test(value) ? "" : "Please enter a valid email address, for example name@example.com.",

    ukPhone: (emptyMessage) => (value) => {
      if (!value) return emptyMessage;
      if (!isValidUkPhone(value)) return "Please enter a valid UK phone number, for example 07123 456789.";
      return "";
    },

    // Required only while `parentName` is set to "Other".
    otherText: (parentName, message) => (value, formData) =>
      formData[parentName] !== OTHER || value ? "" : message,

    website: () => (value) =>
      !value || normalizeWebsite(value) ? "" : "Please enter a valid website, for example example.co.uk.",

    checked: (message) => (checked) => (checked ? "" : message),
  };

  /* ------------------------------------------------------------------------
     Shared form engine
     ------------------------------------------------------------------------ */

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

  // Fields inside a hidden container (an "Other" field that isn't needed, or
  // the other tab's panel) are never validated.
  function isFieldActive(field) {
    return !field.closest("[hidden]");
  }

  // Error elements are "<field id>-error", so ids can differ between forms
  // (e.g. "firstName" vs "employer-firstName") while names stay the same.
  function setFieldError(form, name, message) {
    const field = form.elements[name];
    const errorEl = form.querySelector("#" + CSS.escape(field.id + "-error"));

    errorEl.textContent = message;
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function getFieldError(form, validators, name, formData) {
    return isFieldActive(form.elements[name]) ? validators[name](formData[name], formData) : "";
  }

  function validateField(form, validators, name) {
    const message = getFieldError(form, validators, name, readFormData(form));
    setFieldError(form, name, message);
    return message;
  }

  // Show the "Other" text field only while its parent select is set to Other.
  function toggleOtherField(form, parentName, otherName) {
    const isOther = form.elements[parentName].value === OTHER;
    const otherField = form.elements[otherName];

    otherField.closest(".field").hidden = !isOther;
    otherField.required = isOther;
    if (!isOther) setFieldError(form, otherName, "");
  }

  // A missing list (e.g. a stale cached form-options.js) is logged rather than
  // thrown, so it can't stop the rest of the form from being set up.
  function populateSelect(select, options, { addOther = false } = {}) {
    if (!Array.isArray(options)) {
      console.error("Missing options for #" + select.id + ". Is js/form-options.js up to date?");
    }
    const values = (Array.isArray(options) ? options : []).concat(addOther ? [OTHER] : []);
    values.forEach((value) => select.add(new Option(value, value)));
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Simulated while PREVIEW_MODE is true; otherwise POSTs JSON to the endpoint.
  async function sendInterest(endpoint, payload, label) {
    if (PREVIEW_MODE) {
      console.log("[PREVIEW] " + label + " (simulated, not sent)", payload);
      return new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!endpoint) throw new Error(label + ": endpoint is not configured.");

    // TODO: Confirm request shape and auth with the AWS endpoint.
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(label + ": submission failed with status " + response.status);
  }

  // Hides the desktop intro, the tabs and both panels (the preview notice
  // stays), then shows the given confirmation and moves focus to its heading.
  function showConfirmation(confirmationId, headingText) {
    const confirmation = document.getElementById(confirmationId);
    const heading = confirmation.querySelector(".confirmation-title");

    document.querySelectorAll(".interest-intro, .interest-tabs, .interest-panel").forEach((el) => {
      el.hidden = true;
    });

    heading.textContent = headingText; // textContent, never innerHTML: the name is user input
    confirmation.hidden = false;
    confirmation.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }

  /**
   * Wires a form to the shared behaviour.
   *   validators:          { fieldName: (value, formData) => errorMessage or "" }, in DOM order
   *   otherFields:         { selectName: otherTextName } for "Other" conditional fields
   *   buildPayload:        (formData) => payload
   *   submit:              async (payload) => void, throws on failure
   *   confirmationId:      id of the confirmation shown on success
   *   confirmationHeading: (firstName) => heading text for the confirmation
   *   onFieldChange:       optional (event) => void, runs before validation
   */
  function setupInterestForm(
    form,
    { validators, otherFields = {}, buildPayload, submit, confirmationId, confirmationHeading, onFieldChange }
  ) {
    const submitBtn = form.querySelector(".interest-submit");
    const formError = form.querySelector("#" + CSS.escape(form.id + "-error"));
    const submitLabel = submitBtn.textContent;
    let isSubmitting = false;

    // One handler for both "input" and "change". Typing never shows a new
    // error; it only re-validates a field that is already showing one, so the
    // error clears as soon as the value is valid. Selects, files and
    // checkboxes are validated when their value is committed.
    function handleFieldChange(e) {
      if (onFieldChange) onFieldChange(e);

      const name = e.target.name;
      if (!validators[name]) return;

      if (otherFields[name]) toggleOtherField(form, name, otherFields[name]);

      const isInvalid = e.target.getAttribute("aria-invalid") === "true";
      const isTextEntry = e.target.tagName === "INPUT" && !["checkbox", "file"].includes(e.target.type);
      if (isInvalid || (e.type === "change" && !isTextEntry)) validateField(form, validators, name);
    }

    function handleFieldBlur(e) {
      const name = e.target.name;
      if (!validators[name]) return;
      // Ignore blur caused by the window losing focus (e.g. the file picker opening).
      if (!document.hasFocus()) return;
      validateField(form, validators, name);
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (isSubmitting) return;
      formError.textContent = "";

      const formData = readFormData(form);
      let firstInvalid = null;

      Object.keys(validators).forEach((name) => {
        const message = getFieldError(form, validators, name, formData);
        setFieldError(form, name, message);
        if (message && !firstInvalid) firstInvalid = form.elements[name];
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
        await submit(buildPayload(formData));
        showConfirmation(confirmationId, confirmationHeading(formData.firstName));
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

  /* ------------------------------------------------------------------------
     Worker form
     ------------------------------------------------------------------------ */

  // Shows the attached CV (tick, filename, "Attached", Replace) once valid.
  function initCvField(input, isValidCv) {
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
        attachedFile = file && isValidCv(file) ? file : null;
      }
      render();
    }

    replaceBtn.addEventListener("click", () => input.click());

    return { update };
  }

  const workerValidators = {
    firstName: rules.required("Please enter your first name."),
    lastName: rules.required("Please enter your last name."),
    email: rules.email(),
    phone: rules.ukPhone("Please enter your phone number."),
    location: rules.required("Please select your location."),
    locationOther: rules.otherText("location", "Please enter your location."),
    workType: rules.required("Please choose a work type."),
    cv: (file) => {
      if (!file) return "Please upload your CV.";
      if (file.type !== CV_MIME_TYPE) return "Please upload a PDF file.";
      if (file.size > CV_MAX_BYTES) return "That file is over 10MB. Please upload a smaller PDF.";
      return "";
    },
    agreePrivacy: rules.checked("Please confirm you have read the Privacy Policy."),
    // marketingEmail and marketingSms are optional and deliberately have no validator.
  };

  async function submitWorkerInterest(payload) {
    // TODO: The CV is not part of this payload. It will be uploaded separately
    // via a pre-signed S3 URL returned by the backend, then linked to this
    // submission.
    return sendInterest(WORKER_INTEREST_ENDPOINT, payload, "submitWorkerInterest");
  }

  function buildWorkerPayload(formData) {
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
    if (formData.location === OTHER) payload.locationOther = formData.locationOther;
    return payload;
  }

  function initWorkerForm() {
    const form = document.getElementById("workerForm");
    if (!form) return;

    const cvField = initCvField(form.elements.cv, (file) => !workerValidators.cv(file));

    // Handlers are attached before anything else, so the form can never fall
    // back to a native submit (page reload) if later setup fails.
    setupInterestForm(form, {
      validators: workerValidators,
      otherFields: { location: "locationOther" },
      buildPayload: buildWorkerPayload,
      submit: submitWorkerInterest,
      confirmationId: "worker-confirmation",
      confirmationHeading: (firstName) => (firstName ? "You’re in the Flok, " + firstName + "!" : "You’re in the Flok!"),
      onFieldChange: (e) => {
        if (e.target.name === "cv" && e.type === "change") cvField.update();
      },
    });

    populateSelect(form.elements.location, window.LOCATIONS, { addOther: true });
    populateSelect(form.elements.workType, window.WORK_TYPES);
  }

  /* ------------------------------------------------------------------------
     Employer form
     ------------------------------------------------------------------------ */

  const employerValidators = {
    firstName: rules.required("Please enter your first name."),
    lastName: rules.required("Please enter your last name."),
    businessEmail: rules.email(),
    businessContactNumber: rules.ukPhone("Please enter your business contact number."),
    companyName: rules.required("Please enter your company name."),
    website: rules.website(),
    location: rules.required("Please select your location."),
    locationOther: rules.otherText("location", "Please enter your location."),
    businessType: rules.required("Please select your business type."),
    businessTypeOther: rules.otherText("businessType", "Please describe your business type."),
    companyRegistrationNumber: rules.required("Please enter your company registration number."),
    agreePrivacy: rules.checked("Please confirm you have read the Privacy Policy."),
    // marketingEmail and marketingSms are optional and deliberately have no validator.
  };

  async function submitEmployerInterest(payload) {
    return sendInterest(EMPLOYER_INTEREST_ENDPOINT, payload, "submitEmployerInterest");
  }

  function buildEmployerPayload(formData) {
    const payload = {
      formType: "employer",
      firstName: formData.firstName,
      lastName: formData.lastName,
      businessEmail: formData.businessEmail,
      businessContactNumber: toUkFormat(formData.businessContactNumber, "e164"),
      companyName: formData.companyName,
      location: formData.location,
      businessType: formData.businessType,
      companyRegistrationNumber: formData.companyRegistrationNumber,
      marketingEmail: formData.marketingEmail === true,
      marketingSms: formData.marketingSms === true,
      privacyConsent: formData.agreePrivacy === true,
    };
    if (formData.website) payload.website = normalizeWebsite(formData.website);
    if (formData.location === OTHER) payload.locationOther = formData.locationOther;
    if (formData.businessType === OTHER) payload.businessTypeOther = formData.businessTypeOther;
    return payload;
  }

  function initEmployerForm() {
    const form = document.getElementById("employerForm");
    if (!form) return;

    // Handlers first (see initWorkerForm), then the option lists.
    setupInterestForm(form, {
      validators: employerValidators,
      otherFields: { location: "locationOther", businessType: "businessTypeOther" },
      buildPayload: buildEmployerPayload,
      submit: submitEmployerInterest,
      confirmationId: "employer-confirmation",
      confirmationHeading: (firstName) =>
        firstName ? "Thank you for your interest, " + firstName : "Thank you for your interest",
    });

    populateSelect(form.elements.location, window.LOCATIONS, { addOther: true });
    populateSelect(form.elements.businessType, window.BUSINESS_TYPES, { addOther: true });
  }

  // "Create your venue account" on the employer confirmation. Stays hidden
  // (hidden attribute) unless ENABLE_VENUE_SIGNUP_LINK is true. Opens in a new
  // tab on desktop only; on mobile it opens in the same tab.
  function initVenueSignupLink() {
    const wrapper = document.getElementById("venueSignup");
    if (!wrapper || !ENABLE_VENUE_SIGNUP_LINK) return;

    const link = document.getElementById("venueSignupLink");
    const newTabNote = document.getElementById("venueSignupNewTab");
    const desktop = window.matchMedia("(min-width: 768px)");

    function update() {
      if (desktop.matches) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } else {
        link.removeAttribute("target");
        link.removeAttribute("rel");
      }
      newTabNote.hidden = !desktop.matches;
    }

    update();
    desktop.addEventListener("change", update);
    wrapper.hidden = false;
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  function initPreviewNotice() {
    const notice = document.getElementById("previewNotice");
    if (notice) notice.hidden = !PREVIEW_MODE;
  }

  initPreviewNotice();
  initTabs();
  initWorkerForm();
  initEmployerForm();
  initVenueSignupLink();
})();
