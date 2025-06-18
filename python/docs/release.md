# Creating python package release

1. Decide which packages you want to publish
2. Run `python scripts/bump.py`
3. This will prompt you with the different packages and the next version, select next version or skip for given package
4. Create a release PR
5. Merge and publish a github release

**NOTES**

* Since the development is active on `next` branch, only select this branch when creating github release
* While the development is active, only create release-candidate by selecting `pre` when prompted for next version in `bump.py`