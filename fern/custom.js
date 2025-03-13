(function(d, script) {
  script = d.createElement('script');
  script.async = false;
  script.onload = function(){
    Plain.init({
        appId: 'liveChatApp_01JP6DQTFKKCPPVVVCZG5F99RP',
        hideLauncher: false,
        links: [
          { icon: 'discord', text: 'Join our Discord', url: 'https://discord.com/invite/cNruWaAhQk' },
        ],
        hideBranding: true,
        theme: 'dark',
        style: {
          brandColor: '#076CDF',
          brandBackgroundColor: '#076CDF',
          launcherBackgroundColor: '#FFFFFF',
          launcherIconColor: '#076CDF',
        },
        chatButtons: [{ icon: 'chat', text: 'Chat with us' }],
      });
  };
  script.src = 'https://chat.cdn-plain.com/index.js';
  d.getElementsByTagName('head')[0].appendChild(script);
}(document));
