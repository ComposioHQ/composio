(function (d, script) {
  script = d.createElement("script");
  script.async = false;
  script.onload = function () {
    Plain.init({
      appId: "liveChatApp_01JP6DQTFKKCPPVVVCZG5F99RP",
      hideLauncher: false,
      links: [
        {
          icon: "discord",
          text: "Join our Discord",
          url: "https://dub.composio.dev/discord",
        },
      ],
      hideBranding: true,
      theme: "dark",
      style: {
        brandColor: "#6366F1",
        brandBackgroundColor: "#6366F1",
        launcherBackgroundColor: "#F8F9FF",
        launcherIconColor: "#6366F1",
      },
      chatButtons: [
        { icon: "chat", text: "Chat with us" },
        {
          icon: "bulb",
          text: "Give feedback",
          threadDetails: { labelTypeIds: ["lt_01JP6PBF53YD6EXC2TNEW0XES4"] },
        },
      ],
    });
  };
  script.src = "https://chat.cdn-plain.com/index.js";
  d.getElementsByTagName("head")[0].appendChild(script);
})(document);
