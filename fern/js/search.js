function initializeRunLLM() {
  var script = document.createElement("script");
  script.type = "module";
  script.id = "runllm-widget-script"

  script.src = "https://widget.runllm.com";

  script.setAttribute("version", "stable");
  script.setAttribute("crossorigin", "true");
  script.setAttribute("runllm-keyboard-shortcut", "Mod+j");
  script.setAttribute("runllm-name", "Composio Assistant");
  script.setAttribute("runllm-position", "BOTTOM_RIGHT");
  script.setAttribute("runllm-assistant-id", "1004");

  script.async = true;
  document.head.appendChild(script);
}

// Handle both cases: DOM still loading and already loaded
document.addEventListener("DOMContentLoaded", initializeRunLLM);

// Fallback for when document is already loaded
if (document.readyState === "complete" || document.readyState === "interactive") {
  initializeRunLLM();
}