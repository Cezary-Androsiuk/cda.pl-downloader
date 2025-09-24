
// Listen for messages ariving from content.js script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if message is about downloading stuff
    if (request.action === "download") {
        console.log("Got download request:", request.url)

        // use API chrome.downloads
        chrome.downloads.download({
            url: request.url,
            filename: request.filename
            // here can add more options, like "saveAs: true" to allow user set location
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                // handle eventual errors, like a bad URL
                console.error('Downloading Failed:', chrome.runtime.lastError.message);
                sendResponse({success: false, error: chrome.runtime.lastError.message});
            } else {
                console.log('Downlaoding started, ID:', downloadId);
                sendResponse({success: true});
            }
        });
    }

    // returning true is necessary if we want to send response asynchronously 
    return true; 
});