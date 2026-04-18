/**
 * translate-en.mjs
 * Applies English translations to all Spanish-valued keys in en.json.
 * Run with: node ./scripts/translate-en.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, "../src/i18n/en.json");
const data = JSON.parse(readFileSync(filePath, "utf-8"));

// ─── helpers ────────────────────────────────────────────────────────────────
function set(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]];
    if (!cur) return;
  }
  cur[keys[keys.length - 1]] = value;
}

// ─── translations ────────────────────────────────────────────────────────────

// actividades
set(data, "actividades.actionActivate", "Activate");
set(data, "actividades.actionDeactivate", "Deactivate");
set(data, "actividades.actionDelete", "Delete");
set(data, "actividades.actionEdit", "Edit");
set(data, "actividades.bannerCreated", "Activity created successfully.");
set(data, "actividades.bannerDeleted", "Activity deleted.");
set(data, "actividades.bannerUpdated", "Activity updated successfully.");
set(data, "actividades.buttonCancel", "Cancel");
set(data, "actividades.buttonCreate", "Create activity");
set(data, "actividades.buttonSave", "Save changes");
set(data, "actividades.buttonUpdate", "Update activity");
set(data, "actividades.confirmDelete", "Are you sure you want to delete the activity \"{{name}}\"?");
data.actividades.currencies = {
  ARS: "Argentine peso",
  BRL: "Brazilian real",
  CAD: "Canadian dollar",
  CLP: "Chilean peso",
  COP: "Colombian peso",
  EUR: "Euro",
  GBP: "British pound",
  LOCAL: "Local currency",
  MXN: "Mexican peso",
  PEN: "Peruvian sol",
  USD: "US dollar",
};
set(data, "actividades.empty", "No activities registered.");
set(data, "actividades.errorDelete", "Could not delete the activity.");
set(data, "actividades.errorLoad", "Error loading activities.");
set(data, "actividades.errorMissingCurrency", "Currency is required.");
set(data, "actividades.errorMissingName", "Activity name is required.");
set(data, "actividades.errorMissingRate", "Hourly rate is required.");
set(data, "actividades.errorMissingTenant", "User organization not found (tenant_id/org_id).");
set(data, "actividades.errorNameRequired", "Activity name is required.");
set(data, "actividades.errorRatePositive", "Hourly rate must be greater than 0.");
set(data, "actividades.errorSave", "Could not save the activity.");
set(data, "actividades.errorToggle", "Could not change the activity status.");
set(data, "actividades.fieldCurrency", "Currency");
set(data, "actividades.fieldDescription", "Description");
set(data, "actividades.fieldDescriptionPlaceholder", "Brief description of the activity…");
set(data, "actividades.fieldHourlyRate", "Hourly rate");
set(data, "actividades.fieldHourlyRatePlaceholder", "E.g. 3.50");
set(data, "actividades.fieldName", "Activity name");
set(data, "actividades.fieldNamePlaceholder", "E.g. Sowing, Irrigation, Harvest");
set(data, "actividades.formTitleEdit", "Edit activity");
set(data, "actividades.formTitleNew", "New activity");
set(data, "actividades.loading", "Loading activities…");
set(data, "actividades.readOnlyNote", "Only the owner and administrators can create or edit activities.");
set(data, "actividades.statusActive", "Active");
set(data, "actividades.statusInactive", "Inactive");
set(data, "actividades.tableNoResults", "No activities registered.");
set(data, "actividades.tableTitle", "Activity list");
set(data, "actividades.thActions", "Actions");
set(data, "actividades.thCost", "Cost");
set(data, "actividades.thDescription", "Description");
set(data, "actividades.thName", "Activity");
set(data, "actividades.thStatus", "Status");
set(data, "actividades.title", "Activities");

// admins
data.admins.actions = { makeAdmin: "Make admin", makeOwner: "Make owner", remove: "Remove access" };
data.admins.banner = {
  invitationSent: "Invitation sent successfully.",
  removed: "Administrator removed from the organization.",
  roleUpdated: "Role updated.",
};
data.admins.error = {
  invite: "Could not send the invitation.",
  load: "Error loading the administrator list.",
  remove: "Could not remove the administrator.",
  updateRole: "Could not update the role.",
};
data.admins.form = {
  buttonInvite: "Send invitation",
  emailLabel: "Email address",
  inviteTitle: "Invite new administrator",
  roleLabel: "Role",
};
set(data, "admins.subtitle", "Manage your organization's administrators and their roles.");
data.admins.table = {
  actions: "Actions",
  email: "Email address",
  name: "Name",
  noResults: "No administrators registered.",
  role: "Role",
  status: "Status",
};
set(data, "admins.title", "Administrators");

// app.header
data.app.header = {
  goToPanel: "Go to panel",
  loggedAs: "Signed in as",
  login: "Sign in",
  loginMagic: "Magic link",
  logout: "Sign out",
  organizationAriaLabel: "Select organization",
  organizationLabel: "Organization",
  organizationNone: "No organization",
  roleAdmin: "Administrator",
  roleOwner: "Owner",
  roleTracker: "Tracker",
};

// app.tabs
set(data, "app.tabs.admins", "Administrators");
set(data, "app.tabs.dashboard", "Cost panel");
set(data, "app.tabs.dashboardCostos", "Cost panel");
set(data, "app.tabs.geocercas", "Geofences");
set(data, "app.tabs.home", "Home");
set(data, "app.tabs.invitar_tracker", "Invite tracker");
set(data, "app.tabs.nuevaGeocerca", "New geofence");

// asignaciones.filters
data.asignaciones.filters = {
  refresh: "Refresh",
  refreshLoading: "Updating…",
  status: { activo: "Active", inactivo: "Inactive", todos: "All" },
  statusLabel: "Status",
  searchPlaceholder: "Search (person/geofence)",
  statusDefault: "Status: all",
  statusAll: "Status: all",
  geofenceAll: "Geofence: all",
  personalAll: "Personnel: all",
};

// asignaciones.form
data.asignaciones.form = {
  activityLabel: "Activity",
  activityPlaceholder: "Select an activity",
  select: "Select",
  buttonCancel: "Cancel",
  buttonCreate: "Create assignment",
  buttonUpdate: "Update assignment",
  cancelEditButton: "Cancel editing",
  editTitle: "Edit assignment",
  endLabel: "End date/time",
  endOptionalHint: "Optional",
  frequencyLabel: "Frequency (minutes)",
  geofenceLabel: "Geofence",
  geofencePlaceholder: "Select a geofence",
  newTitle: "New assignment",
  personLabel: "Person",
  personPlaceholder: "Select a person",
  quickActivity: {
    newButton: "New activity",
    newNamePlaceholder: "Name of the new activity",
    noActivitiesHint: "No activities (create one in the Activities module or below).",
    saveButton: "Save activity",
    saving: "Saving…",
  },
  saveButton: "Save assignment",
  startLabel: "Start date/time",
  statusActive: "Active",
  statusInactive: "Inactive",
  statusLabel: "Status",
  updateButton: "Update assignment",
  newActivityPlaceholder: "Name of the new activity",
  saveActivityButton: "Save activity",
  savingActivity: "Saving…",
  cancelButton: "Cancel",
  startDateLabel: "Start date",
  startDatePlaceholder: "DD/MM/YYYY HH:MM or 2025-11-13T09:11",
  endDateLabel: "End date (optional)",
  endDatePlaceholder: "DD/MM/YYYY HH:MM or 2025-11-14T19:17",
  activityOptional: "(Optional) Select…",
  createButtonLabel: "Create assignment",
};

// asignaciones.messages
data.asignaciones.messages = {
  catalogError: "Error loading catalogs (personnel, geofences, activities).",
  confirmDelete: "Are you sure you want to delete this assignment?",
  createGenericError: "Could not create the assignment.",
  createSuccess: "Assignment created successfully.",
  deleteError: "Could not delete the assignment.",
  deleteSuccess: "Assignment deleted successfully.",
  activatedSuccess: "Assignment activated successfully.",
  deactivatedSuccess: "Assignment deactivated successfully.",
  toggleStatusError: "Error changing assignment status.",
  frequencyInvalidRange: "Frequency must be between 5 minutes and 12 hours.",
  frequencyTooLow: "The minimum allowed frequency is 5 minutes.",
  loadError: "Error loading assignments.",
  loadingData: "Loading assignment data…",
  noActivities: "No activities created. Create at least one Activity to assign.",
  noPersonal: "No active personnel in this organization. Reactivate or create at least one person.",
  overlapError: "This person already has an active assignment that overlaps in that date range.",
  saveGenericError: "An error occurred while saving the assignment.",
  selectDates: "You must enter a start and end date and time.",
  selectPersonAndFence: "You must select a person and a geofence.",
  updateGenericError: "Could not update the assignment.",
  updateSuccess: "Assignment updated successfully.",
};

// asignaciones.table
data.asignaciones.table = {
  actions: "Actions",
  activity: "Activity",
  end: "End",
  frequency: "Freq (min)",
  geofence: "Geofence",
  noResults: "No assignments registered.",
  person: "Person",
  start: "Start",
  status: "Status",
  title: "Assignment list",
};

set(data, "asignaciones.title", "Assignments");
data.asignaciones.states = { all: "all", active: "active", inactive: "inactive" };

// auth.signup
data.auth.signup = {
  title: "Create account",
  subtitle: "Create your account with Magic Link or use Google.",
  labels: { fullName: "Full name (optional)", email: "Email" },
  placeholders: { fullName: "Your name", email: "your@email.com" },
  buttons: { creating: "Sending...", create: "Create account with Magic Link" },
  errors: {
    invalidEmail: "Enter a valid email address.",
    mustAcceptTerms: "You must accept the Terms and Privacy Policy.",
    sendFailed: "Could not send the Magic Link: {{message}}",
    unknown: "Unknown error{{#if message}}: {{message}}{{/if}}",
    googleFailed: "Could not sign in with Google: {{message}}",
    googleNoUrl: "No redirect URL received from Google.",
    googleUnknown: "Unknown Google OAuth error{{#if message}}: {{message}}{{/if}}",
  },
  messages: { magicLinkSent: "We sent you a Magic Link. Check your email and open the link to confirm your account." },
  terms: { acceptance: "I accept the", terms: "Terms", and: "and the", privacy: "Privacy Policy" },
  alreadyHaveAccount: "Already have an account?",
  loginLink: "Sign in",
  separator: "or",
  oauthGoogle: "Sign up with Google",
};

// authInvite
data.authInvite = {
  continue: "Continue",
  expiredOrUsed: "The invitation is invalid, has expired, or was already used.",
  goToLogin: "Go to sign in",
  notInviteLink: "This link is not a valid invitation. Use the invitation link you received by email.",
  processing: "Validating invitation…",
  timeout: "Invitation validation took too long. Try again.",
  title: "You have been invited",
};

// dashboard
set(data, "dashboard.cards.totalCost", "Total cost");
set(data, "dashboard.cards.totalGeofences", "Geofences");
set(data, "dashboard.cards.totalHours", "Total hours");
set(data, "dashboard.cards.totalPersons", "Personnel");
data.dashboard.charts = {
  costByActivity: "Cost by activity",
  costByGeofence: "Cost by geofence",
  costByPerson: "Cost by person",
  hoursByDay: "Hours by day",
};
set(data, "dashboard.errorLoad", "Error loading the cost panel.");
data.dashboard.filters = { apply: "Apply", clear: "Clear", dateFromLabel: "From", dateToLabel: "To" };
set(data, "dashboard.subtitle", "View aggregated costs by person, activity and geofence.");
set(data, "dashboard.title", "Cost panel");

// forgot
data.forgot = {
  back: "Back to sign in",
  email: "Email",
  emailPh: "your@email.com",
  errorEmail: "Enter a valid email address.",
  errorGeneric: "Could not send the email.",
  noteDesc: "The link will go through /auth/callback and redirect you to /reset-password to create your new password.",
  noteTitle: "Note",
  send: "Send link",
  sending: "Sending…",
  subtitle: "We'll send you a link to create a new password. If it doesn't arrive, check your spam folder.",
  success: "✅ If the email exists, you'll receive a link to create a new password. Check your spam folder and open it in the same browser.",
  tip: "Tip: if the link fails, generate a new one and open it in an incognito window.",
  title: "Reset password",
};

// geocercas
set(data, "geocercas.buttonClearCanvas", "Clear map");
set(data, "geocercas.buttonDeleteSelected", "Delete selected");
set(data, "geocercas.buttonDrawByCoords", "Draw by coordinates");
set(data, "geocercas.buttonShowAll", "Show all");
set(data, "geocercas.buttonShowOnMap", "Show on map");
set(data, "geocercas.buttonShowSelected", "Show selected");
set(data, "geocercas.cardListBody", "Soon you will be able to see the list of existing geofences and their details here. For now, use the New geofence option to create and edit.");
set(data, "geocercas.cardListTitle", "Geofence list");
set(data, "geocercas.cardNewBody", "Create a new geofence on the map and assign it to your personnel or activities.");
set(data, "geocercas.cardNewCta", "Go to New geofence →");
set(data, "geocercas.cardNewTitle", "New geofence");
set(data, "geocercas.currentOrgLabel", "Current organization:");
set(data, "geocercas.currentUserLabel", "User:");
set(data, "geocercas.cursorHint", "Move the mouse over the map");
set(data, "geocercas.deleteConfirm", "Delete the selected geofences?");
set(data, "geocercas.deletedCount", "Deleted: {{count}}");
set(data, "geocercas.draftLabel", "Draft");
set(data, "geocercas.errorCoordsInvalid", "Invalid coordinates. Use format: lat,lng (one per line).");
set(data, "geocercas.errorNameRequired", "Enter a name for the geofence.");
set(data, "geocercas.errorNoGeojson", "GeoJSON for the geofence was not found.");
set(data, "geocercas.errorNoShape", "Draw a geofence or create one by coordinates before saving.");
set(data, "geocercas.errorSelectAtLeastOne", "Select at least one geofence.");
set(data, "geocercas.loadingDataset", "Loading dataset...");
set(data, "geocercas.noGeofences", "You have no geofences yet.");
set(data, "geocercas.noOrgFallback", "— (no organization selected)");
set(data, "geocercas.pageSubtitle", "Manage your organization's geofences. From here you can create new geofences and review existing ones.");
set(data, "geocercas.pageTitle", "Geofences");
set(data, "geocercas.panelTitle", "Geofences");
set(data, "geocercas.subtitleNew", "Draw a geofence on the map and assign it to your personnel or activities.");
set(data, "geocercas.coordsReady", "Shape created from coordinates.");
set(data, "geocercas.deleteError", "Could not delete. Try again.");
set(data, "geocercas.errorLoad", "Could not load the geofence.");
set(data, "geocercas.showManyOk", "Showing {{count}} geofences.");
set(data, "geocercas.planUsageTitle", "Geofences");
set(data, "geocercas.planAvailableTitle", "Available");
set(data, "geocercas.draftYes", "yes");
set(data, "geocercas.draftNo", "no");
data.geocercas.plan = {
  loading: "Loading plan...",
  error: "Could not load plan limits.",
  unlimited: "Geofences with no configured limit.",
  usage: "Current usage: {{used}} / {{max}} geofences",
  unlimitedShort: "Unlimited",
  limitReached: "You have reached the geofence limit for your current plan. Upgrade to PRO to continue.",
  limitReachedTitle: "You have reached your plan's geofence limit.",
  limitReachedBody: "To create more geofences, upgrade your organization to PRO.",
  freeHint: "FREE plan active. When you reach the limit, you can upgrade to PRO from here.",
  activePaidHint: "Your organization has a plan with higher capacity enabled.",
};

// help.common
data.help.common = {
  back: "Back",
  badge: "Help center",
  breadcrumb: "Help Center",
  goHome: "Go to Home",
  quickGuideBadge: "Quick guide",
  viewFaq: "View FAQ",
};

// help.faq
set(data, "help.faq.backToPanel", "Go to panel");
set(data, "help.faq.seeQuickGuide", "See quick guide");
data.help.faq.sections = [
  {
    title: "Access and roles",
    items: [
      {
        q: "How do I get access to the app?",
        a: "You need an invitation from an Owner/Admin of an organization. If you don't have access, ask them to invite you.",
      },
      {
        q: "What is the difference between Owner, Administrator and Tracker?",
        a: "Owner manages the organization and administrators. Administrator manages operational data (geofences, personnel, activities, assignments). Tracker is a field user who sends GPS points.",
      },
      {
        q: "Can I manage more than one organization?",
        a: "Yes. Owners can work with multiple organizations and switch using the organization selector.",
      },
    ],
  },
  {
    title: "Tracking",
    items: [
      {
        q: "Why do I see \"No recent data\" in Tracker?",
        a: "The tracker may be offline, without location permissions, or without an active assignment. Check permissions and assignments.",
      },
      {
        q: "How often is the location sent?",
        a: "The frequency is defined in the assignment. The minimum allowed is 5 minutes to preserve battery and data.",
      },
      {
        q: "Does it work with a weak signal?",
        a: "Yes. The tracker can store points and sync when connectivity returns (depending on your build and permissions).",
      },
    ],
  },
  {
    title: "Costs and reports",
    items: [
      {
        q: "How are costs calculated?",
        a: "Costs are calculated from assignments (hours) and the hourly rate configured in each activity.",
      },
      {
        q: "Can I export to Excel?",
        a: "Yes. Reports can be exported as CSV, which you can open in Excel or Google Sheets.",
      },
      {
        q: "Can I filter by geofence, person, activity and date range?",
        a: "Yes. Use the filters in Reports and the Cost panel to focus by geofence(s), person(s), activity(ies) and dates.",
      },
    ],
  },
  {
    title: "Data and privacy",
    items: [
      {
        q: "What location data is stored?",
        a: "Only the points needed for tracking and geofence validation. Access is controlled by roles and organization.",
      },
      {
        q: "Can a tracker see data from other organizations?",
        a: "No. Data is isolated by organization (multi-tenant) and protected by database security rules.",
      },
    ],
  },
];

// help.instructions
set(data, "help.instructions.bestPractice1Body", "Always use the same phone to avoid breaks in tracking.");
set(data, "help.instructions.bestPractice1Title", "Use your main phone");
set(data, "help.instructions.bestPractice2Body", "Keep enough battery or plug in during long shifts.");
set(data, "help.instructions.bestPractice2Title", "Watch your battery");
set(data, "help.instructions.bestPractice3Body", "Do not sign out or disable location while you are on route.");
set(data, "help.instructions.bestPractice3Title", "Keep the session active");
set(data, "help.instructions.bestPractice4Body", "If something does not load, re-open your most recent invitation link.");
set(data, "help.instructions.bestPractice4Title", "Re-open the link if it fails");
set(data, "help.instructions.recommendationBody", "Before leaving, make sure you see the \"Active tracking\" status on your screen.");
set(data, "help.instructions.recommendationTitle", "Recommendation");
data.help.instructions.resultBullets = [
  "Your invitation was accepted successfully.",
  "You granted location permissions on your phone.",
  "You see the \"Active tracking\" status.",
  "You keep internet and location enabled.",
  "If it does not work, you can request a new invitation or contact support.",
];
set(data, "help.instructions.resultIntro", "When done, you should have everything ready to share your location without issues:");
set(data, "help.instructions.resultTitle", "What you must confirm");
set(data, "help.instructions.tipsTitle", "Best practices");

// help.onboarding
data.help.onboarding = {
  title: "First steps",
  subtitle: "How to start using the tracker for the first time.",
  sections: [
    {
      title: "Invitation and access",
      items: [
        { q: "How do I start using the tracker?", a: "You will receive an invitation link. Just open it from your phone and follow the steps." },
        { q: "Do I need to install anything?", a: "No. Just open the link and accept the permissions when prompted." },
      ],
    },
  ],
};

// help.tracker
data.help.tracker = {
  title: "Location tracking",
  subtitle: "What it means for tracking to be active.",
  sections: [
    {
      title: "Tracking status",
      items: [
        { q: "What does 'Active tracking' mean?", a: "It means your location is being shared correctly." },
        { q: "Do I need to keep the app open?", a: "Not always. As long as your device has permissions and connection, tracking can continue." },
      ],
    },
  ],
};

// help.troubleshooting
data.help.troubleshooting = {
  title: "Common problems",
  subtitle: "Quick solutions for the most common cases.",
  sections: [
    {
      title: "Invitation and permissions",
      items: [
        { q: "I can't accept the invitation", a: "Make sure you open the most recent link. If it keeps failing, request a new invitation." },
        { q: "The link says it is inactive", a: "This can happen if you opened an earlier link. Use the latest link received." },
        { q: "Tracking is not starting", a: "Check that you accepted location permissions on your device." },
      ],
    },
  ],
};

// help.geofences
data.help.geofences = {
  title: "Geofences",
  subtitle: "What they are and how they work within tracking.",
  sections: [
    {
      title: "Basic concepts",
      items: [
        { q: "What is a geofence?", a: "It is an area defined on the map to record entries, exits or presence." },
        { q: "Do I have to do anything as a tracker?", a: "No. The system automatically records your activity when applicable." },
      ],
    },
  ],
};

// help.account
data.help.account = {
  title: "Account and access",
  subtitle: "Questions about signing in and accessing the organization.",
  sections: [
    {
      title: "Access",
      items: [
        { q: "How do I sign in?", a: "Use your email and password from the sign-in screen." },
        { q: "What do I do if I am in the wrong organization?", a: "Make sure you use the correct invitation link or sign in again with the indicated account." },
      ],
    },
  ],
};

// help.changelog.items (translate the duplicate Spanish array)
data.help.changelog.items = [
  {
    version: "v1.2.0",
    date: "2026-04",
    changes: [
      "Improved tracker invitation flow",
      "More stable and reliable tracking",
      "Clearer and more consistent interface",
      "Bug fixes for tracking activation",
    ],
  },
  {
    version: "v1.1.0",
    date: "2026-03",
    changes: [
      "Improved geofence system",
      "Performance optimization",
      "Login and session handling improvements",
    ],
  },
];

// deleteAccount
data.deleteAccount = {
  title: "Delete account",
  subtitle: "Request permanent deletion of your App Geocercas account and associated data.",
  warning: { title: "Warning", body: "Deleting your account is permanent and cannot be undone." },
  whatWillBeDeleted: {
    title: "What will be deleted",
    items: {
      accountInfo: "User account information",
      profileData: "Personal profile data",
      trackerAssignments: "Tracker assignments",
      gpsRecords: "GPS location records",
      geofences: "Geofences created by the account",
      activityLogs: "Activity logs related to the account",
    },
  },
  retention: {
    title: "Retention note",
    body: "Some limited data may be temporarily retained when necessary for legal compliance, fraud prevention, or security reasons.",
  },
  processingTime: {
    title: "Processing time",
    body: "Account deletion requests are processed within 30 days of receipt. Once completed, the account and associated data cannot be recovered.",
  },
  account: { title: "Account", signedInAs: "Signed in as:", unknownUser: "Unknown user" },
  confirmCheckbox: "I understand this action is permanent and my account data cannot be recovered.",
  confirmInputLabel: "Type DELETE to confirm",
  confirmKeyword: "DELETE",
  submitButton: "Request account deletion",
  submitting: "Sending...",
  successMessage: "Your deletion request was received. Your account and associated data will be deleted within the next 30 days.",
  publicPolicyLink: "View public deletion policy",
  errors: {
    noAuthenticatedUser: "No active authenticated user found.",
    confirmationRequired: "Confirm the action and type \"DELETE\" to continue.",
    requestFailed: "Could not create the deletion request.",
  },
};

// inicio
data.inicio = {
  cards: {
    common: { soon: "Coming soon" },
    faq: {
      badge: "Help",
      body: "Find answers to common questions about invitations, roles, costs and tracker usage.",
      cta: "View frequently asked questions",
      title: "Frequently asked questions",
    },
    instrucciones: {
      badge: "Quick guide",
      body: "Follow step by step how to set up organizations, geofences, personnel, activities and trackers.",
      cta: "View instructions",
      title: "Instructions",
    },
    novedades: {
      badge: "Updates",
      body: "Review the history of changes, new features, improvements and fixes on the platform.",
      cta: "View changelog",
      title: "Updates / Changelog",
    },
    queEs: {
      badge: "Information",
      body: "Learn about the vision, use cases and benefits of App Geocercas for your organization.",
      cta: "Read more",
      title: "What is App Geocercas?",
    },
    soporte: {
      badge: "Support",
      body: "Need help? Contact us for technical support, billing or questions about your account.",
      cta: "Go to support",
      title: "Contact / Support",
    },
    videoDemo: {
      badge: "Video",
      body: "Watch a short demo of how App Geocercas works in real life.",
      cta: "View video demo",
      title: "Video demo",
    },
  },
  header: {
    badge: "Help center and resources",
    subtitle: "From here you can access instructions, frequently asked questions, support and App Geocercas updates.",
    title: "Welcome to your panel",
  },
  userInfo: {
    connectedAs: "Connected as",
    inOrg: "in the organization",
    orgIdLabel: "Organization ID:",
    userLabel: "User:",
    withRole: "with the role",
  },
  billing: data.inicio?.billing ?? {
    managePlan: "Manage plan",
    managePlanBody: "You can go to the Billing page to view and manage your subscription.",
    goToBilling: "Go to Billing",
    previewNote: "Note: PREVIEW/TEST. Does not affect production.",
  },
};

// inviteTracker
data.inviteTracker = {
  backToTracker: "Back to Tracker",
  emailLabel: "Tracker email address",
  emailPlaceholder: "tracker@example.com",
  errors: {
    emailInvalid: "Enter a valid email address.",
    emailRequired: "You must enter an email address.",
    noOrg: "Could not resolve an active organization for this user.",
    planBlocked: "The organization's current plan does not allow tracker invitations.",
    notInOrg: "Your user is not linked to the active organization.",
    inviteErrorPrefix: "Error sending the invitation",
  },
  form: {
    buttonSend: "Send invitation",
    buttonSending: "Sending invitation…",
    emailHelp: "An invitation will be sent to this email.",
    emailLabel: "Tracker email address",
    emailPlaceholder: "tracker@example.com",
    selectHelp: "If you select a person, their email will be filled in automatically.",
    selectLabel: "Select active personnel (optional)",
    selectPlaceholder: "-- Select personnel --",
  },
  diag: { orgUsed: "Organization used", user: "User", membersLoaded: "Members loaded" },
  empty: { noMembers: "No active personnel available to invite." },
  ok: {
    generated: "Invitation generated successfully.",
    emailSent: "Invitation email sent successfully.",
    fallbackLink: "Could not send the email. Use this link to share access manually.",
    magicLinkFallback: "Magic link generated as a fallback.",
  },
  plan: {
    validating: "Validating organization plan…",
    validationError: "Could not validate the organization plan.",
    requiresProTitle: "PRO plan required",
    detectedPlan: "Detected plan",
    freeBlockedBody: "Tracker invitations are not available on the current FREE plan.",
    upgradePrompt: "Upgrade this organization to PRO to enable tracker invitations.",
  },
  messages: {
    createdWithoutEmail: "Tracker access was created without sending an email.",
    genericProcessed: "The invitation for {{correo}} was processed successfully.",
    invited: "An invitation has been sent to {{correo}} to join as a tracker in {{orgName}}.",
    linkOnlyNoLink: "The invitation was created, but no public link was received.",
    linkOnlyWithLink: "The invitation was created. Use this link to share access: {{link}}.",
    magiclinkSent: "A magic access link was sent to {{correo}}.",
    notOk: "Could not complete the invitation. Check the email and try again.",
    serverProblem: "There was a problem contacting the invitation server.",
    unexpectedError: "Unexpected error processing the invitation.",
  },
  onlyExistingNote: "Only people already in your organization can be invited.",
  orgFallback: "your organization",
  selectPersonLabel: "Select a person",
  sendInvite: "Send invitation",
  subtitle: "Select a member of your personnel or enter an email manually to invite them as a tracker in {{orgName}}.",
  title: "Invite tracker",
};

// landing (only Spanish values)
set(data, "landing.accessBody", "This application requires an account invited by an administrator. If you don't have access, request an invitation from your organization.");
set(data, "landing.accessHint", "Tip: use \"Magic link\" if your administrator invited you by email.");
set(data, "landing.accessTitle", "Access with authorized account");
set(data, "landing.assistanceControlBody", "Verify who was inside each geofence, at what time and in what activity.");
set(data, "landing.assistanceControlTitle", "Attendance control");
set(data, "landing.bulletCostsBody", "Consult Power BI-style panels with costs by person, activity and geofence.");
set(data, "landing.bulletCostsTitle", "Costs");
set(data, "landing.bulletGeocercasBody", "Create and manage geofences for your fields, farms, plants or service points.");
set(data, "landing.bulletGeocercasTitle", "Geofences");
set(data, "landing.bulletPersonalBody", "Register your personnel and assign them to activities and specific areas.");
set(data, "landing.bulletPersonalTitle", "Personnel");
set(data, "landing.ctaLogin", "Go to control panel");
set(data, "landing.ctaMagic", "Sign in with magic link");
set(data, "landing.email", "Email");
set(data, "landing.footerFaq", "Frequently asked questions");
set(data, "landing.footerPrivacy", "Privacy");
set(data, "landing.footerSupport", "Support");
set(data, "landing.footerTerms", "Terms");
set(data, "landing.goPanel", "Go to panel");
set(data, "landing.goToDashboard", "Go to panel");
set(data, "landing.invalidEmail", "Invalid email.");
set(data, "landing.livePanelLabel", "Live panel");
set(data, "landing.livePanelTitle", "Real-time operations");
set(data, "landing.demoLiveLabel", "Live demo");
set(data, "landing.demoOperationsAreaLabel", "Operations area");
set(data, "landing.demoLoop10sLabel", "Loop 10s");
set(data, "landing.login", "Sign in");
set(data, "landing.loginButton", "Enter");
set(data, "landing.logout", "Sign out");
set(data, "landing.magicEnter", "Sign in with magic link");
set(data, "landing.magicLinkError", "Could not send the link. Please try again.");
set(data, "landing.magicLinkSent", "We sent you an access link. Check your email.");
set(data, "landing.magicNote", "Important: access works only with the real magic link.");
set(data, "landing.multiOrgBody", "Manage multiple companies or projects from a single account, with separate roles and permissions.");
set(data, "landing.multiOrgTitle", "Multi-organization");
set(data, "landing.privacyMiniNote", "Privacy: location is used only for geofence and tracking features as permitted by the user.");
set(data, "landing.quickAccessDesc", "If you prefer, you can sign in using a magic link (no password).");
set(data, "landing.reviewNote", "Note: If you are reviewing the app (Google Play), use the credentials provided in Play Console (App access).");
set(data, "landing.rightsReserved", "All rights reserved");
set(data, "landing.zonesActive", "Active zones");

// personal
set(data, "personal.bannerCreated", "Personnel created successfully.");
set(data, "personal.bannerDeletedOk", "Record deleted successfully.");
set(data, "personal.bannerEditMode", "Edit mode.");
set(data, "personal.bannerLoadingSession", "Loading session…");
set(data, "personal.bannerLoginRequired", "You must sign in to access this section.");
set(data, "personal.bannerNewMode", "Creating new personnel.");
set(data, "personal.bannerRefreshedOk", "Data updated successfully.");
set(data, "personal.bannerSelected", "Record selected.");
set(data, "personal.bannerUpdated", "Personnel updated successfully.");
set(data, "personal.buttonDelete", "Delete");
set(data, "personal.buttonFullList", "View all");
set(data, "personal.buttonNew", "New");
set(data, "personal.buttonSave", "Save");
set(data, "personal.errorDelete", "Could not delete the record.");
set(data, "personal.errorDeleteNoRows", "Could not delete: the record does not exist or was already deleted.");
set(data, "personal.errorMissingEmail", "Email is required.");
set(data, "personal.errorMissingName", "Name is required.");
set(data, "personal.errorMissingUser", "Could not get the authenticated user.");
set(data, "personal.errorMustSelectForDelete", "You must select a record to delete.");
set(data, "personal.errorMustSelectForEdit", "You must select a record to edit.");
set(data, "personal.errorNoAuthUser", "There is no authenticated user.");
set(data, "personal.errorNoPermissionCreate", "You do not have permission to create personnel.");
set(data, "personal.errorNoPermissionDelete", "You do not have permission to delete personnel.");
set(data, "personal.errorNoPermissionEdit", "You do not have permission to edit personnel.");
set(data, "personal.errorNoPermissionSave", "You do not have permission to save changes.");
set(data, "personal.errorPhonePolicy", "Phone must start with + (international E.164 format).");
set(data, "personal.errorSave", "Could not save the personnel record.");
set(data, "personal.errorSaveNoRecord", "No updated record was received.");
set(data, "personal.fieldActive", "Active");
set(data, "personal.fieldEmail", "Email");
set(data, "personal.fieldLastName", "Last name");
set(data, "personal.fieldName", "Name");
set(data, "personal.fieldPhonePlaceholder", "Phone (+593…)");
set(data, "personal.formTitleEdit", "Edit personnel");
set(data, "personal.formTitleNew", "New personnel");
set(data, "personal.no", "No");
set(data, "personal.orgFallback", "No organization");
set(data, "personal.orgInfoLabel", "Organization:");
set(data, "personal.pillCanEdit", "Editable");
set(data, "personal.pillReadOnly", "Read only");
set(data, "personal.roleLabel", "Role:");
data.personal.table.columns.end = "End";
data.personal.table.columns.lastName = "Last name";
data.personal.table.columns.start = "Start";
set(data, "personal.table.loading", "Loading…");
set(data, "personal.table.noActive", "No active personnel.");
set(data, "personal.tableActive", "Active");
set(data, "personal.tableEmail", "Email");
set(data, "personal.tableLastName", "Last name");
set(data, "personal.tableName", "Name");
set(data, "personal.tableNoResults", "No results found.");
set(data, "personal.tablePhone", "Phone");
set(data, "personal.title", "Personnel");
set(data, "personal.yes", "Yes");

// reportes
data.reportes = {
  activityNoName: "Unnamed activity",
  buttonDownloadCsv: "Download CSV",
  colActividad: "Activity",
  colCosto: "Cost",
  colFin: "End",
  colGeocerca: "Geofence",
  colHoras: "Hours",
  colInicio: "Start",
  colMoneda: "Currency",
  colPersona: "Person",
  colTarifa: "Rate/hour",
  csvHeaderActividad: "Activity",
  csvHeaderCosto: "Total_cost",
  csvHeaderFin: "End",
  csvHeaderGeocerca: "Geofence",
  csvHeaderHoras: "Hours",
  csvHeaderInicio: "Start",
  csvHeaderMoneda: "Currency",
  csvHeaderPersona: "Person",
  csvHeaderTarifa: "Hourly_rate",
  csvHeaderTotal: "Total_cost",
  errorCsv: "Could not generate the CSV file.",
  errorLabel: "Error:",
  errorLoad: "Error loading reports.",
  errorLoadFilters: "Error loading filters (people, activities, geofences).",
  errorLoadReport: "Error loading the cost report.",
  errorRangeInvalid: "The \"From\" date cannot be later than the \"To\" date.",
  errorViewMissing: "The view v_costos_detalle has not been created in Supabase yet.",
  exportNoData: "No data to export.",
  filters: {
    activityLabel: "Activity",
    apply: "Apply filters",
    clear: "Clear filters",
    dateFromLabel: "From",
    dateToLabel: "To",
    geofenceLabel: "Geofence",
    personLabel: "Person",
  },
  filtersActivity: "Activity",
  filtersAll: "All",
  filtersApply: "Apply filters",
  filtersClear: "Clear filters",
  filtersFrom: "From",
  filtersGeofence: "Geofence",
  filtersPerson: "Person",
  filtersTitle: "Filters",
  filtersTo: "To",
  geofenceNoName: "Unnamed geofence",
  headerSubtitle: "Query and export costs by person, activity and geofence.",
  loadingReport: "Loading report…",
  noAccessBody: "You do not have permission to view cost reports. This module is available only for owners and administrators.",
  personNoName: "Unnamed person",
  summaryRecordsHelp: "Number of rows matching the current filters.",
  summaryRecordsLabel: "Records",
  summaryTotalCostHelp: "Sum of costs calculated by person, activity and geofence.",
  summaryTotalCostLabel: "Total cost",
  summaryTotalHoursHelp: "Sum of hours for all assignments in the selected range.",
  summaryTotalHoursLabel: "Total hours",
  table: {
    activity: "Activity",
    currency: "Currency",
    end: "End",
    geofence: "Geofence",
    hours: "Hours",
    noResults: "No records found for the selected filters.",
    person: "Person",
    rate: "Rate/hour",
    start: "Start",
    title: "Cost details",
    total: "Total cost",
  },
  tableEmpty: "No records for the selected filters.",
  tableExportButton: "Export CSV",
  tableExportHelp: "Export the current details as a CSV file.",
  tableTitle: "Cost details",
  title: "Cost reports",
};

// resetPassword
data.resetPassword = {
  backHome: "Go to landing",
  backToLogin: "Back to sign in",
  confirmPassword: "Confirm password",
  confirmPlaceholder: "Repeat",
  invalidOrExpired: "The recovery link is invalid or has expired. Request a new one.",
  loading: "Preparing recovery link…",
  newPassword: "New password",
  newPasswordPlaceholder: "At least 8 characters",
  noSession: "There is no valid session to reset the password. Request a new one.",
  noticeType: "Session detected. If this link was not for recovery, sign in normally again.",
  passwordMin: "The password must be at least 8 characters.",
  passwordMismatch: "Passwords do not match.",
  saveButton: "Save new password",
  saving: "Saving…",
  subtitle: "Create a new password for your account.",
  success: "Password updated successfully. You can now sign in.",
  tip: "Tip: go back to /sign-in, enter your email and use \"Forgot your password?\" to generate a new link.",
  title: "Reset password",
  unexpected: "An error occurred while preparing the password reset.",
  updateFailed: "Could not update the password. Please try again.",
  updateUnexpected: "Unexpected error updating the password.",
};

// tracker
data.tracker.controls = {
  centerOnUser: "Center on my position",
  refresh: "Refresh positions",
  showAll: "Show all",
  showInside: "Only inside geofences",
};
set(data, "tracker.errorLoad", "Error loading tracker positions.");
data.tracker.legend = {
  geofence: "Geofence",
  insideFence: "Inside geofence",
  outsideFence: "Outside geofence",
};
data.tracker.status = { offline: "No recent data", online: "Tracker online" };
set(data, "tracker.subtitle", "View tracker locations within your geofences in real time.");
data.tracker.table = {
  activity: "Activity",
  geofence: "Geofence",
  noResults: "No positions recorded.",
  person: "Person",
  status: "Status",
  timestamp: "Date/time",
  title: "Latest positions",
};
set(data, "tracker.title", "GPS Tracker");

// table
data.table = {
  name: "Name",
  status: "Status",
  lastPosition: "Last position",
  lastUpdate: "Last update",
};

// status
data.status = { online: "Online", stale: "Outdated", offline: "Offline" };

// trackerDashboard
data.trackerDashboard = {
  title: "Tracking panel",
  timeWindows: { "1h": "1 hour", "6h": "6 hours", "12h": "12 hours", "24h": "24 hours" },
  sections: { filters: "Filters", diagnostics: "Diagnostics", map: "Map" },
  labels: {
    window: "Window",
    tracker: "Tracker",
    geofences: "Geofences",
    all: "All",
    activeOrg: "Active org",
    activeOrgDebug: "Org (Active)",
    detectedPlan: "Detected plan",
  },
  actions: {
    resolveOrgAgain: "Re-resolve org (RPC)",
    refresh: "Refresh",
    loading: "Loading…",
    centerGeofence: "Center geofence",
  },
  states: {
    validatingPlan: "Validating organization plan...",
    planValidationFailed: "Could not validate the organization plan.",
    moduleUnavailable: "This module is not available on the organization's current plan.",
    requiresPro: "The tracking panel requires PRO or higher.",
    upgradeHint: "Upgrade your plan to view positions, routes and geofences from this panel.",
    upgradeOrgPrompt: "Upgrade this organization to enable the Tracker panel.",
    resolvingActiveOrg: "Resolving active organization…",
  },
  messages: {
    loadAssignmentsError: "Error loading assignments (tracker_assignments).",
    loadGeofencesError: "Error loading geofences.",
    loadPositionsError: "Error loading positions.",
    noActiveAssignments: "No active assignments (tracker_assignments). Showing all active geofences (the default is pre-selected).",
    noActiveGeofencesForAssignments: "There are assignments, but no active geofences for those assignments in the org ({{orgId}}).",
    fallbackGeofenceShown: "No active geofences found; 1 active geofence was shown as fallback to avoid an empty panel.",
    noActiveGeofencesForOrg: "No active geofences available for this org ({{orgId}}).",
    noVisibleGeofences: "No active/visible geofences available for this org (or you don't have permission to see them).",
    orgResolveError: "Error resolving org",
  },
  badges: {
    assignments: "assignments",
    trackers: "trackers",
    geofences: "geofences",
    polys: "polys",
    circles: "circles",
    positions: "positions",
    source: "src",
    assignedIds: "assignedIds",
    selected: "selected",
    bounds: "bounds",
    viewport: "viewport",
    intersects: "intersects",
  },
  map: { initializing: "Initializing map…", statusPrefix: "map", circleLabel: "{{name}} (circle)" },
  tooltip: { tracker: "Tracker", time: "Time", lat: "Lat", lng: "Lng", accuracy: "Acc", speed: "Speed", source: "Src" },
  multiGeofence: {
    labelBase: "Geofences",
    labelNone: "Geofences: None",
    labelAll: "Geofences: All ({{count}})",
    labelSelected: "Geofences: {{count}}",
    searchPlaceholder: "Search geofence…",
    showAll: "Show all",
    hideAll: "Hide all",
    noResults: "No results…",
    close: "Close",
  },
};

// trackerGps
data.trackerGps = {
  title: "GPS Tracker",
  lastSend: "Last send",
  waitingCoords: "Waiting for coordinates…",
  debugCopyPaste: "Debug (copy/paste)",
  stateLabel: "Status",
  onlyInvited: "This page is for invited trackers only.",
  goHome: "Go to home",
  status: {
    initializing: "Initializing tracker…",
    processingMagicLink: "Processing Tracker Magic Link…",
    sessionOkPreparing: "Session OK. Preparing tracker…",
    readingSession: "Reading tracker session…",
    noSession: "There is no active tracker session.",
    noGeolocation: "This device does not support geolocation.",
    active: "Tracker active",
    activating: "Activating tracker in the organization…",
    noPermission: "Tracker without permission / onboarding",
    gpsError: "GPS error",
  },
  errors: {
    notConfigured: "The tracker is not configured in this deployment.",
    noSupabaseClient: "The main Supabase client was not found.",
    setSession: "Error in setSession:",
    hashSession: "Hash session error:",
    openFromMagicLinkOnly: "Open this page only from your Tracker Magic Link.",
    geolocationUnavailable: "Geolocation not available.",
  },
  membership: {
    missingOrgId: "org_id is missing from the URL. Open this page from the invitation link: /tracker-gps?org_id=<ORG_ID>.",
    checking: "Verifying membership…",
    noValidTokenUser: "No valid token/user in /tracker-gps.",
    okSessionCache: "Membership OK (session cache).",
    membershipsSelectError: "Error in memberships select:",
    alreadyExists: "Membership already exists: role={{role}}",
    runningAccept: "No membership found. Running accept-tracker-invite",
    acceptError: "Error from accept-tracker-invite:",
    membershipsRecheckError: "Error rechecking memberships:",
    acceptReturnedButNotCreated: "accept-tracker-invite returned OK but the membership was not created.",
    acceptOk: "accept-tracker-invite OK.",
    onboardingException: "Exception during onboarding:",
  },
  disclosure: {
    title: "Background location",
    body1: "App Geocercas collects your location even when the app is closed or the phone is locked, to record positions and validate entry and exit from geofences during your work shift.",
    body2: "This information is used solely for operational purposes of the organization and is not shared with third parties or used for advertising. You can stop tracking by revoking the location permission or signing out.",
    continue: "Continue",
  },
  debugLabels: {
    send: "send",
    accept: "accept",
    orgId: "org_id",
    membership: "membership",
    tokenIss: "token_iss",
    tokenTtlSec: "token_ttl_sec",
    lastHttpStatus: "last_http_status",
    lat: "lat",
    lng: "lng",
    acc: "acc",
  },
};

// billing (translate remaining Spanish values)
set(data, "billing.title", "Billing");
set(data, "billing.authRequired", "Sign in to manage your plan.");
data.billing.previewNotice = {
  prefix: "Monetization in",
  middle: "(Subscription flow).",
  suffix: "Does not affect production.",
};
data.billing.actions = { viewPlans: "View plans" };
data.billing.labels = { email: "Email", orgId: "Organization ID" };
data.billing.planState = { title: "Plan status" };
data.billing.states = { loadingPlanStatus: "Loading plan status..." };
data.billing.errors = { loadPlanStatus: "Could not load plan status." };
data.billing.cards = {
  currentPlan: "Current plan",
  status: "Status",
  trialUntil: "Trial until",
  currentPeriodUntil: "Current period until",
};
data.billing.subscriptionManagement = {
  title: "Subscription management",
  description: "Open Billing to manage your subscription details.",
};
data.billing.messages = {
  cancelAtPeriodEnd: "Your subscription is set to cancel at the end of the current period.",
  activePlanExists: "An active plan already exists for this organization. The upgrade button is not shown.",
};
data.billing.compareBeforeUpgrade = {
  title: "Want to compare before upgrading?",
  description: "Review the plans page to compare Free, Pro and Enterprise.",
};
data.billing.status = {
  trialing: "Trial",
  active: "Active",
  pastDue: "Past due",
  canceled: "Canceled",
  free: "Free",
};

// reports
data.reports = {
  title: "Reports",
  currentOrg: "Current org",
  sessionLoading: "Loading your session…",
  noActiveSession: "No active session. Sign in again.",
  noActiveOrg: "No active organization for this user.",
  filters: {
    title: "Filters",
    subtitle: "Select ranges and lists. Then press Generate.",
    reloadLists: "Reload lists",
    reloadFilters: "Reload filters",
    clearSelections: "Clear selections",
    clearSelectionsTitle: "Clear selections (does not clear dates)",
    from: "From",
    to: "To",
    generate: "Generate",
    generating: "Generating…",
    exportCsv: "Export CSV",
    tipLabel: "Tip:",
    tipMultiSelect: "In multi-select lists use Ctrl (Windows) / Command (Mac) to select multiple.",
    geofences: "Geofences",
    people: "People",
    activities: "Activities",
    assignments: "Assignments",
    multi: "(multi)",
    assignmentFallback: "assignment",
    assignmentNote: "Note: if your assignments do not have personal_id, the join with check-ins may be empty.",
  },
  results: {
    title: "Results",
    generating: "Generating report…",
    rows: "Rows: {{count}}",
    emptyHint: "No data yet. Adjust filters and generate.",
    loading: "Loading…",
    noDataSelectedFilters: "No data for the selected filters.",
  },
  table: {
    day: "Day",
    person: "Person",
    email: "Email",
    geofence: "Geofence",
    activity: "Activity",
    assignment: "Assignment",
    entry: "Entry",
    exit: "Exit",
    marks: "Check-ins",
    inside: "Inside",
    distanceM: "Dist (m)",
    rate: "Rate",
    dash: "—",
  },
  errors: {
    loadFilters: "Error loading filters.",
    noActiveOrgOrSession: "No active organization or session is not ready.",
    invalidDateRange: "The \"From\" date cannot be later than the \"To\" date.",
    generateReport: "Error generating report.",
    exportNoData: "No data to export.",
  },
};

// activityAssignments
data.activityAssignments = {
  title: "Activity assignments",
  subtitle: "Define which activity each person performs in a date range. The same person cannot have two activities at the same time.",
  session: "Session",
  actions: {
    new: "+ New assignment",
    refresh: "Refresh",
    edit: "Edit",
    delete: "Delete",
    clear: "Clear",
    newShort: "New",
    saveChanges: "Save changes",
    createAssignment: "Create assignment",
    saving: "Saving...",
  },
  filters: {
    trackerPerson: "Tracker / Person",
    activity: "Activity",
    startFrom: "Start from",
    endUntil: "End until",
    allTrackers: "All",
    allActivities: "All",
  },
  table: {
    title: "Assignment list",
    loading: "Loading...",
    person: "Person",
    activity: "Activity",
    start: "Start",
    end: "End",
    actions: "Actions",
    empty: "No assignments for the current filters.",
  },
  form: {
    titleCreate: "New assignment",
    titleEdit: "Edit assignment",
    titleView: "Details / new assignment",
    trackerPerson: "Person / Tracker",
    activity: "Activity",
    startDate: "Start date",
    endDateOptional: "End date (optional)",
    selectOption: "Select...",
  },
  messages: {
    initialLoadError: "Error loading initial data",
    activitiesLoadError: "Could not load activities",
    trackersLoadError: "Could not load trackers",
    assignmentsLoadError: "Could not load assignments",
    requiredFields: "Tracker, activity and start date are required",
    assignedSuccessfully: "Activity assigned successfully",
    updatedSuccessfully: "Assignment updated successfully",
    invalidFormMode: "Invalid form mode",
    constraintOverlap: "Cannot assign this activity: the person already has another activity in that date range.",
    saveError: "Error saving the activity assignment",
    deletedSuccessfully: "Assignment deleted successfully",
    deleteError: "Could not delete the activity assignment",
  },
  overlap: {
    selectedPerson: "selected",
    otherActivity: "another activity",
    noEndDate: "no end date",
    message: "The person {{person}} already has the activity \"{{activity}}\" assigned between {{start}} and {{end}}.",
  },
  confirmDelete: "Are you sure you want to delete the assignment of \"{{activity}}\" for \"{{tracker}}\"?",
  fallbacks: { activity: "activity", tracker: "tracker" },
};

// admin
data.admin = {
  dashboard: {
    title: "Administration Panel",
    configRequired: "Configuration required",
    modules: {
      geocercas: "Geofences",
      geocercasV2: "Geofences V2",
      personal: "Personnel",
      reports: "Reports",
    },
    modulesDescriptions: {
      geocercas: "Manage your organization's geofences",
      geocercasV2: "Enhanced geofences with new interface",
      personal: "Manage field personnel",
      reports: "View reports and events",
    },
    logout: "Sign out",
  },
  geocercasV2: {
    title: "Geofences",
    showAll: "Show all",
    back: "← Back",
    savedGeofencesHeader: "Saved geofences",
    loading: "Loading...",
    noGeofences: "No geofences",
    status: { active: "Active", inactive: "Inactive" },
    actions: {
      view: "View",
      deactivate: "Deactivate",
      activate: "Activate",
      edit: "Edit",
      editInMap: "Edit on map",
      delete: "Delete",
    },
    floatingActions: { save: "Save", cancel: "Cancel" },
    prompt: {
      name: "Geofence name:",
      newName: "New name (leave the same if you don't want to change):",
      editCoords: "Edit coordinates (lat,lng per line). Leave blank to keep:",
    },
    manualForm: {
      title: "Create geofence manually",
      hintFormat: "Format: lat,lng per line. Minimum 3 lines.",
      saveButton: "Save manual",
    },
    labels: { personal: "Personnel:", assignments: "Assignments:" },
    mapControls: { latLngTip: "Move cursor to see Lat/Lng" },
  },
  usersRoles: {
    title: "Users and Roles",
    processing: "Processing…",
    inviteSection: "Invite user",
    emailPlaceholder: "email@domain.com",
    fullNamePlaceholder: "Full name",
    fullNameLabel: "Full name",
    roleOwner: "OWNER",
    inviteButton: "Invite",
    pendingInvitesTitle: "Pending invitations",
    noPending: "No invitations.",
    usersTitle: "Users",
    noUsers: "No registered users.",
    table: {
      email: "Email",
      name: "Name",
      role: "Role",
      date: "Date",
      actions: "Actions",
      newRole: "New Role",
    },
    magicLink: "Magic Link",
    deleteButton: "Delete",
    assignButton: "Assign",
    confirmDelete: "Delete/suspend {{correo}}?",
    inviteSuccess: "Invitation sent to {{correo}}",
    assignSuccess: "Role \"{{role}}\" assigned to {{correo}}",
    magicLinkSentInvite: "Invitation sent to {{correo}}",
    magicLinkSentLink: "Magic link sent to {{correo}}",
    deleteSuccess: "User {{correo}} deleted/suspended",
  },
  geofences: {
    errors: {
      loadFailed: "Could not load the list",
      invalidPolygon: "Draw a valid polygon.",
      saveFailed: "Error saving",
      invalidInput: "Check name and at least 3 valid coordinates.",
      createFailed: "Could not save the geofence",
      statusChangeFailed: "Could not change status",
      deleteFailed: "Could not delete",
      noCoordinates: "Geofence with no valid coordinates",
      minimumPoints: "At least 3 valid points are required.",
      editFailed: "Could not edit",
      invalidCoordinates: "Invalid coordinates.",
      invalidPolygonData: "Invalid polygon.",
    },
    messages: {
      created: "✅ Geofence saved.",
      createdManual: "Geofence created (manual).",
      activated: "✅ Activated",
      deactivated: "✅ Deactivated",
      deleted: "🗑️ Deleted.",
      updated: "✏️ Geofence updated.",
      mapEditActive: "🟠 Map edit active. Adjust vertices and click 'Save changes'.",
      editCancelled: "Edit cancelled.",
      changesSaved: "✅ Changes saved.",
    },
    confirmDelete: "Delete \"{{name}}\"?",
  },
};

// trackerPanel
data.trackerPanel = {
  title: "Tracker Panel",
  description: "Here you will see your assigned geofences, your status (inside/outside) and you can report incidents.",
  logout: "Sign out",
};

// mapaTracking
data.mapaTracking = {
  traceLabel: "Trace:",
  timeWindows: { "15min": "15 min", "30min": "30 min", "60min": "60 min" },
  refresh: "Refresh",
  loading: "Loading…",
};

// newOrg
data.newOrg = {
  title: "New organization",
  labels: { name: "Name", slug: "Slug (optional)" },
  placeholders: { name: "E.g. Main Farm", slug: "e.g. main-farm" },
  buttons: { create: "Create", cancel: "Cancel" },
};

// geofenceForm
data.geofenceForm = {
  title: "New geofence",
  fields: { name: "Name", coordinates: "Coordinates", onePerLine: "per line" },
  placeholders: { name: "E.g. Field 1", example: "-0.1807, -78.4678" },
  labels: { name: "Name", coordinates: "Coordinates (lat,lng per line)" },
  actions: { save: "Save geofence", saving: "Saving..." },
  hints: { mapSelection: "Draw or select on the map; if the box is empty, that polygon will be used." },
  map: { lat: "Lat", lng: "Lng", movePointer: "Move the pointer over the map…" },
  errors: { minPoints: "At least 3 points are required." },
  fallbacks: { unnamed: "Unnamed" },
  messages: {
    saved: "Geofence saved successfully.",
    errorPrefix: "Error",
    created: "Geofence created successfully.",
    createError: "Error creating geofence",
    updated: "Geofence(s) updated successfully.",
    updateError: "Error updating geofence",
    deleted: "Geofence(s) deleted successfully.",
    deleteError: "Error deleting geofence",
  },
};

// geofences (bottom namespace)
data.geofences = {
  labels: { personal: "Personnel:", assignments: "Assignments:" },
  actions: { links: "Links" },
};

// ─── write ───────────────────────────────────────────────────────────────────
writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log("✅ en.json translated successfully.");
