document.addEventListener('DOMContentLoaded', () => {
    const topicInput = document.getElementById('topic-input');
    const startButton = document.getElementById('start-button');
    const tweetFeed = document.getElementById('tweet-feed');
    const loadingIndicator = document.getElementById('loading-indicator');
    let eventSource = null;

    startButton.addEventListener('click', () => {
        const topic = topicInput.value.trim();
        if (!topic) {
            alert('Please enter a simulation topic.');
            return;
        }

        if (eventSource) {
            eventSource.close();
            console.log("Previous EventSource closed.");
        }

        tweetFeed.innerHTML = '';
        loadingIndicator.textContent = 'Starting simulation stream...';
        loadingIndicator.style.display = 'block';
        startButton.disabled = true;
        topicInput.disabled = true;

        const url = `/simulation_stream?topic=${encodeURIComponent(topic)}`;
        eventSource = new EventSource(url);
        console.log(`Connecting to SSE endpoint: ${url}`);

        let isFirstTweet = true;

        eventSource.onmessage = (event) => {
            try {
                const tweetData = JSON.parse(event.data);

                if (tweetData.role === "System" && tweetData.content === "Simulation Complete") {
                    console.log("Received completion signal.");
                    if (loadingIndicator.style.display !== 'none') {
                        loadingIndicator.style.display = 'none';
                    }
                    closeConnectionAndEnableInputs();
                    return;
                }

                if (tweetData.role !== "System Status" && tweetData.role !== "System Error" && tweetData.role !== "System Info") {
                  if (isFirstTweet) {
                      loadingIndicator.style.display = 'none';
                      isFirstTweet = false;
                  }
                  displaySingleTweet(tweetData);
                } else if (tweetData.role === "System Error") {
                    if (isFirstTweet) {
                        loadingIndicator.style.display = 'none';
                        isFirstTweet = false;
                    }
                     displaySingleTweet(tweetData);
                }

            } catch (error) {
                console.error('Error parsing tweet data:', error, 'Data:', event.data);
                if (loadingIndicator.style.display !== 'none') {
                    loadingIndicator.style.display = 'none';
                }
                displaySingleTweet({ role: "System Error", content: "Error processing message from server." });
            }
        };

        eventSource.onerror = (error) => {
            console.error('EventSource failed:', error);
            loadingIndicator.textContent = 'Connection error. Please try again.';
            loadingIndicator.style.display = 'block';
            tweetFeed.innerHTML = '<p class="system_error">Connection to server failed. Check server logs and try again.</p>';
            closeConnectionAndEnableInputs();
        };
    });

    function displaySingleTweet(tweet) {
        const tweetElement = document.createElement('div');
        const roleClass = tweet.role.replace(/\s+/g, '_');
        tweetElement.classList.add('tweet', roleClass);

        let profileElement;
        if (tweet.profile_pic_url) {
            profileElement = document.createElement('img');
            profileElement.src = tweet.profile_pic_url;
            profileElement.alt = `${tweet.role} profile picture`;
            profileElement.classList.add('profile-pic');
        } else {
            profileElement = document.createElement('div');
            profileElement.classList.add('profile-pic-placeholder');
            let initial = '?';
            if (tweet.role && typeof tweet.role === 'string') {
               if (tweet.role.startsWith('System')) {
                   initial = 'S';
               } else {
                   initial = tweet.role.substring(0, 1).toUpperCase();
               }
            }
            profileElement.textContent = initial;
        }

        const tweetMainArea = document.createElement('div');
        tweetMainArea.classList.add('tweet-main-area');

        const authorElement = document.createElement('div');
        authorElement.classList.add('tweet-author');
        authorElement.textContent = tweet.role;

        const contentElement = document.createElement('div');
        contentElement.classList.add('tweet-content');
        contentElement.textContent = tweet.content;

        const actionsElement = document.createElement('div');
        actionsElement.classList.add('tweet-actions');

        if (roleClass !== 'System_Error' && roleClass !== 'System_Info') {
            const randomReplyCount = Math.floor(Math.random() * 50) + 1;
            const randomRetweetCount = Math.floor(Math.random() * 100);
            const randomViewsCount = Math.floor(Math.random() * 50000) + 1000;

            const replyContainer = document.createElement('button');
            replyContainer.classList.add('action-icon', 'reply-button');
            replyContainer.setAttribute('aria-label', 'Reply');
            replyContainer.innerHTML =
                `<div class="icon-wrapper">
                    <svg viewBox="0 0 24 24" aria-hidden="true" class="action-svg"><g><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></g></svg>
                 </div>
                 <span class="count">${randomReplyCount}</span>`;
            actionsElement.appendChild(replyContainer);

            const retweetContainer = document.createElement('button');
            retweetContainer.classList.add('action-icon', 'retweet-button');
            retweetContainer.setAttribute('aria-label', 'Retweet');
            retweetContainer.innerHTML =
                `<div class="icon-wrapper">
                    <svg viewBox="0 0 24 24" aria-hidden="true" class="action-svg"><g><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></g></svg>
                 </div>
                 <span class="count">${randomRetweetCount}</span>`;
            actionsElement.appendChild(retweetContainer);

            const likeButtonContainer = document.createElement('button');
            likeButtonContainer.classList.add('action-icon', 'like-button');
            likeButtonContainer.setAttribute('aria-label', 'Like');
            
            const likeCountNum = (typeof tweet.likes === 'number') ? tweet.likes : 0;
            likeButtonContainer.setAttribute('data-like-count', likeCountNum);

            likeButtonContainer.innerHTML = 
                `<div class="icon-wrapper heart-wrapper">
                    <svg viewBox="0 0 24 24" aria-hidden="true" class="action-svg heart-icon"><g><path class="heart-path-outline" d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path><path class="heart-path-fill" d="M12 21.63l-.55-.52C6.15 16.43 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-4.15 7.93-9.45 12.61L12 21.63z"></path></g></svg>
                 </div>
                 <span class="count like-count">${likeCountNum}</span>`;

            likeButtonContainer.onclick = (e) => {
                const button = e.currentTarget;
                const isLiked = button.classList.toggle('liked');
                let currentCount = parseInt(button.getAttribute('data-like-count')) || 0;
                const newCount = isLiked ? currentCount + 1 : Math.max(0, currentCount -1); 
                button.setAttribute('data-like-count', newCount);
                button.querySelector('.like-count').textContent = newCount;
                button.setAttribute('aria-label', isLiked ? `${newCount} Likes. Unlike` : `${newCount} Likes. Like`);
                console.log('Like button clicked!');
            };
            actionsElement.appendChild(likeButtonContainer);
            
            const viewsContainer = document.createElement('span');
            viewsContainer.classList.add('action-icon', 'views-button');
            viewsContainer.setAttribute('aria-label', 'Views');
            const formattedViews = randomViewsCount > 999 ? (randomViewsCount / 1000).toFixed(randomViewsCount < 10000 ? 1 : 0) + 'K' : randomViewsCount;
            viewsContainer.innerHTML =
                `<div class="icon-wrapper">
                    <svg viewBox="0 0 24 24" aria-hidden="true" class="action-svg"><g><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path></g></svg>
                 </div>
                 <span class="count">${formattedViews}</span>`;
            actionsElement.appendChild(viewsContainer);
            
            const extraActionsContainer = document.createElement('span');
            extraActionsContainer.classList.add('extra-actions'); 
            
            const bookmarkContainer = document.createElement('button');
            bookmarkContainer.classList.add('action-icon', 'bookmark-button');
            bookmarkContainer.setAttribute('aria-label', 'Bookmark');
            bookmarkContainer.innerHTML = 
                 `<div class="icon-wrapper">
                     <svg viewBox="0 0 24 24" aria-hidden="true" class="action-svg"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g></svg>
                 </div>`;
            extraActionsContainer.appendChild(bookmarkContainer);

            const shareContainer = document.createElement('button');
            shareContainer.classList.add('action-icon', 'share-button');
            shareContainer.setAttribute('aria-label', 'Share');
            shareContainer.innerHTML = 
                 `<div class="icon-wrapper">
                     <svg viewBox="0 0 24 24" aria-hidden="true" class="action-svg"><g><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path></g></svg>
                 </div>`;
            extraActionsContainer.appendChild(shareContainer);

            actionsElement.appendChild(extraActionsContainer);
        }

        tweetMainArea.appendChild(authorElement);
        tweetMainArea.appendChild(contentElement);
        tweetMainArea.appendChild(actionsElement);

        tweetElement.appendChild(profileElement);
        tweetElement.appendChild(tweetMainArea);

        tweetFeed.appendChild(tweetElement);
    }
    
    function closeConnectionAndEnableInputs() {
         if (eventSource) {
            eventSource.close();
            eventSource = null;
            console.log("EventSource closed.");
        }
        startButton.disabled = false;
        topicInput.disabled = false;
    }

});
