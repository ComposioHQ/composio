/**
 * Entry module for the Python generation pipeline. `composio generate py`
 * imports it dynamically from inside its handler so the pipeline stays off every
 * other command's startup path.
 */
export { createToolkitIndex } from 'src/generation/create-toolkit-index';
export { BANNER } from 'src/generation/constants';
export { generatePythonSources } from 'src/generation/python/generate';
