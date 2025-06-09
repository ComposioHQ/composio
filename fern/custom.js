(function(d, script) {
  script = d.createElement('script');
  script.async = false;
  script.onload = function(){
    Plain.init({
      appId: "liveChatApp_01JP6DQTFKKCPPVVVCZG5F99RP",
      hideLauncher: false,
      requireAuthentication: true,

      // Updated links
      links: [
        {
          icon: "book",
          text: "View our docs",
          url: "https://docs.composio.dev/getting-started/welcome",
        },
        {
          icon: "discord",
          text: "Join our Discord",
          url: "https://dub.composio.dev/discord",
        },
      ],
      // Styling from your current configuration
      hideBranding: true,
      theme: "dark",
      style: {
        brandColor: "#076CDF", 
        brandBackgroundColor: "#076CDF",
        launcherBackgroundColor: "#FFFFFF",
        launcherIconColor: "#076CDF",
      },
      position: {
        right: '20px',
        bottom: '20px',
      },
      // Simplified chat buttons with three main categories
      chatButtons: [
        // API / SDK Issues Button
        {
          icon: 'bug',
          text: 'API / SDK Issues',
          threadDetails: {
            priority: 'high',
          },
          form: {
            fields: [
              {
                type: 'dropdown',
                placeholder: 'Select Issue Type',
                options: [
                  {
                    icon: 'error',
                    text: 'API Issue',
                    threadDetails: {
                      labelTypeIds: ['lt_01JPPWDM0DNWQ3TZ4P579BE0JZ'],
                    }
                  },
                  {
                    icon: 'bug',
                    text: 'JavaScript SDK',
                    threadDetails: {
                      labelTypeIds: ['lt_01JPVXQF4HBBA7VNSCMJHTQSNE'],
                    }
                  },
                  {
                    icon: 'bug',
                    text: 'Python SDK',
                    threadDetails: {
                      labelTypeIds: ['lt_01JPVXQANCFAYQ8R7BPSW7XP6Y'],
                    }
                  }
                ],
              }
            ],
          },
        },
        
        // Integration / Tool Issues Button
        {
          icon: 'integration',
          text: 'Integration / Tool Issues',
          threadDetails: {
            priority: 'high',
          },
          form: {
            fields: [
              {
                type: 'dropdown',
                placeholder: 'Select Issue Type',
                options: [
                  {
                    icon: 'integration',
                    text: 'Tool Authentication Not Working',
                    threadDetails: {
                      labelTypeIds: ['lt_01JQ3ZVABTEA7ZW6BR4RPZ2VV6'],
                    }
                  },
                  {
                    icon: 'integration',
                    text: 'Action Not Working',
                    threadDetails: {
                      labelTypeIds: ['lt_01JQ3ZT8G3QSNZ2T7MBFWB9WMK'],
                    }
                  },
                  {
                    icon: 'integration',
                    text: 'Trigger Not Working',
                    threadDetails: {
                      labelTypeIds: ['lt_01JQ3ZTXTS2997K038M5EPQ0HC'],
                    }
                  },
                  {
                    icon: 'bulb',
                    text: 'Request New Action/Trigger',
                    threadDetails: {
                      labelTypeIds: ['lt_01JQ3ZWVCJH4XHM895JCM1FJ4Q'],
                    }
                  }
                ],
              }
            ],
          },
        },
        
        // General Questions Button
        {
          icon: 'chat',
          text: 'General Questions',
          threadDetails: {
            priority: 'medium',
          },
          form: {
            fields: [
              {
                type: 'dropdown',
                placeholder: 'Select Topic',
                options: [
                  {
                    icon: 'book',
                    text: 'Documentation Help',
                    threadDetails: {
                      labelTypeIds: ['lt_01JP6PBF53YD6EXC2TNEW0XES4'],
                    }
                  },
                  {
                    icon: 'send',
                    text: 'Pricing Information',
                    threadDetails: {
                      labelTypeIds: ['lt_01JQ401BG3RPK4WT0187R44P6P'],
                    }
                  },
                  {
                    icon: 'support',
                    text: 'Security Questions',
                    threadDetails: {
                      labelTypeIds: ['lt_01JQ401V3WA4M50JKNZJMK60MV'],
                    }
                  },
                  {
                    icon: 'chat',
                    text: 'Other Question',
                    threadDetails: {
                      labelTypeIds: ['lt_01JP21C6MM2JCTX1C5RME57FAJ'], // MCP label for "Other"
                    }
                  }
                ],
              }
            ],
          }
        }
      ]
    });
  };
  script.src = 'https://chat.cdn-plain.com/index.js';
  d.getElementsByTagName('head')[0].appendChild(script);
}(document));