## Browser Tool profiles do not work in Zero Data Retention projects

If a Browser Tool task returns `403 - Profiles are not available for Zero Data Retention projects`, the task is trying to use a persistent browser profile in a project that is configured not to retain execution data.

Browser profiles are the saved browser environment behind logged-in or stateful browser automation. They can include cookies, local storage, session data, and other browser state needed to keep the same website session across actions. Projects configured for Zero Data Retention, or for removing execution data, cannot retain that profile state.

This is a project data-retention setting issue, not an OAuth reconnect, Browser Tool version, or provider credential issue. Use Browser Tool from a project where your data-retention policy allows browser profile state to be stored, or change the project's log/data visibility setting where policy allows. In the dashboard, check Project Settings / Log storage configuration. In the API, the related setting is `log_visibility_setting: show_all`.
