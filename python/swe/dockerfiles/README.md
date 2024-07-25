# Generate Test Images For SWE Bench

Generate the Dockerfiles using `generate.py`

```
python generate.py
```

This will generate the Dockerfiles in `generated/`, after this you can build
the docker images using `build.py`

```
python build.py
```

If you want to test the changes you made in the `composio/`, go to 
`python/dockerfiles` and run

```
make dev && docker tag composio/composio:dev composio/composio:latest
```

and build the images again.