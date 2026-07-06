## Browser Tool profiles do not work in Zero Data Retention projects

Browser Tool profiles rely on persisted browser state, such as cookies, local storage, and session data. This is what lets a browser session stay signed in or keep the same profile context across browser actions.

Projects configured for Zero Data Retention, or for removing execution data, cannot retain that profile state. In those projects, profile-backed Browser Tool usage can fail or behave as if no reusable browser profile is available.

Use Browser Tool from a project where your data-retention policy allows execution data to be stored, or change the project's log/data visibility setting where policy allows. In the dashboard, check Project Settings / Log storage configuration. In the API, the related setting is `log_visibility_setting: show_all`.
