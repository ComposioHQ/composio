# Release Process for Python Package (RC Version)

## Manual Release Process

1. **Update Version**: Use the bump script to update to desired RC version
   ```bash
   python scripts/bump.py --pre
   ```
   This will:
   - Update the version in `__version__.py`
   - Update `setup.py` with the new version
   - Update dependency references in files
   - Update Dockerfiles that reference the package

2. **Create Branch and PR**: 
   ```bash
   git checkout -b release/v0.7.16-rc.X
   git add .
   git commit -m "Bump version to 0.7.16-rc.X"
   ```

3. **Update CHANGELOG.md**: Add release notes for the RC version

4. **Review and Merge PR**: After review, merge the PR to master

5. **Create GitHub Release**: Create a new release with the RC tag (v0.7.16-rc.X)
   
   Using GitHub CLI:
   ```bash
   # Create a new tag if it doesn't exist
   git tag v0.7.16-rc.X
   git push origin v0.7.16-rc.X
   
   # Create a release from the tag
   gh release create v0.7.16-rc.X --title "v0.7.16-rc.X" --notes "Release notes for this RC version" --prerelease
   ```
   
   Alternatively via GitHub web interface:
   1. Go to the repository on GitHub
   2. Click on "Releases" in the right sidebar
   3. Click "Draft a new release"
   4. Enter the tag version (e.g., v0.7.16-rc.X)
   5. Fill in the release title and description
   6. Check "This is a pre-release" for RC versions
   7. Click "Publish release"

## Manual Publishing (if needed)

- **Test Publish to TestPyPI**:
  ```bash
  make test-publish
  ```
  (Requires `PYPI_PASSWORD` environment variable)

- **Publish to PyPI**:
  ```bash
  make publish
  ```
  (Requires `PYPI_PASSWORD` environment variable)

## Automated Publishing

The GitHub workflow (`release.yaml`) automatically handles publishing when a new GitHub release is created, including:

- Publishing core Python package to PyPI
- Publishing plugin packages to PyPI
- Publishing SWE toolkit to PyPI
- Building CLI executables for multiple platforms
- Publishing Docker images
- Publishing E2B template

## Version Format

RC versions follow the format: `X.Y.Z-rc.N` where N is incremented for each new RC.