Stage a local image or video with `image_file` or `video_file` before creating and publishing the Instagram post. A filesystem path or session URL is not itself an `image_url` or `video_url`.

## Before you start

This applies only to the current uploadable-file inputs on the Instagram media action. A direct media URL can still work when it meets that action's current schema requirements.

## Publish in two steps

1. Send the local uploadable file with `image_file` or `video_file` to create the media container. Composio stages it to a temporary public URL for the provider.
2. Use the returned container in the separate publish action after creation succeeds.

Do not treat container creation as publication. Verify the current action inputs in the [Instagram toolkit](/toolkits/instagram) before changing an existing integration.

See Meta's [Instagram Content Publishing guide](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing/) for provider media and publishing requirements.
