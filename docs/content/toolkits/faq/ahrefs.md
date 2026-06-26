## What must Ahrefs actions do?

Ahrefs API calls should use the API host https://api.ahrefs.com/v3. If Ahrefs actions or connection checks are hitting https://ahrefs.com/v3 and returning 404 HTML, treat it as a connector base-URL configuration problem rather than a user-side API-key or request-payload issue. Check the toolkit config and current-user endpoint for the api.ahrefs.com host before troubleshooting individual action files, because action files may already use the correct URL while shared config still routes some calls incorrectly.
