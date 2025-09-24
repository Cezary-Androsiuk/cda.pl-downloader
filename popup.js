
function createComponentsForTargetPageUsage(){
    // only move them from other vid
    const contentNode = document.getElementById("content");
    const hiddenContentNode = document.getElementById("hiddenContent");
    contentNode.innerHTML = hiddenContentNode.innerHTML;
    hiddenContentNode.remove();
}

async function getAllNetworkResourcesFromCurrentPage(currentTabID){
    function getAllNetworkResources(){
        // Use Performance API, to download list of all resources
        const resources = performance.getEntriesByType('resource'); // GEMINI

        // Extract only URLs from downloaded objects
        // Property 'name' contains full URL of the resource
        const resourceUrls = resources.map(resource => resource.name); // GEMINI
        return resourceUrls;
    }

    const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: currentTabID },
        function: getAllNetworkResources
    })

    return injectionResults[0].result;
}



async function findMediaResources(resources){
    const resolutionIDsMap = {
        "hd":       { "name": "1080p",  "value": 1080 },
        "sd":       { "name": "720p",   "value": 720 },
        "lq":       { "name": "480p",   "value": 480 },
        "vl":       { "name": "360p",   "value": 360 },
        "unknown":  { "name": "Unknown","value": 0 }
    }

    /*  CHARACTERISTIC DATA ASPECTS
        1. ends with .mp4
        2. starts with: hd, sd, lq, vl
        3. could have "a_" prefix if it is an audio file
        4. id between type_resolution and extension is 32 lettes long

        example:
        a_hd 1dad6cfbe0473b4541c888906f42a1db
          hd 1dad6cfbe0473b4541c888906f42a1db 1080p
          sd 1dad6cfbe0473b4541c888906f42a1db 720p
          lq 1dad6cfbe0473b4541c888906f42a1db 480p
          vl 1dad6cfbe0473b4541c888906f42a1db 360p
        https://gwaw404.cda.pl/17505302raw/a_hd661c2aab87f156e66c5bbe0cd3a73d36.mp4
    */

    const filteredResources = []
    for(const resource of resources){
        /// resource contains something like this:
        // https://gwaw404.cda.pl/17505302raw/a_hd661c2aab87f156e66c5bbe0cd3a73d36.mp4
        // https://gwaw404.cda.pl/17505302raw/hd661c2aab87f156e66c5bbe0cd3a73d36.mp4
        // https://gwaw404.cda.pl/17505302raw/sd661c2aab87f156e66c5bbe0cd3a73d36.mp4

        const res = String(resource);
        if(!res.endsWith(".mp4"))
            continue;

        const fileName = res.split('/').pop(); // gives something like that: "a_hd661c2aab87f156e66c5bbe0cd3a73d36.mp4"
        const isAudioFile = fileName.startsWith("a_");
        const filePrefix = fileName.slice(0, -(32 + 4)) // 32 is ID length and 4 is an extension length, gives something like: "a_hd"
        const resolutionID = isAudioFile ? filePrefix.slice(2) : filePrefix;

        // get readable resolution if possible
        let resolution = resolutionIDsMap.unknown;
        if(resolutionID in resolutionIDsMap){
            resolution = resolutionIDsMap[resolutionID];
        }

        // check if resource is already on the list (they're are comming like a DASH XDD)
        let urlPresent = false;
        for(const fr of filteredResources){
            if(fr.url === resource){
                urlPresent = true;
                break;
            }
        }

        // add to the list
        if(!urlPresent){
            filteredResources.push({
                "url": resource,
                "name": fileName,
                "isAudioFile": isAudioFile,
                "resolutionID": resolutionID,
                "resolution": resolution
            })
        }

    }

    console.log("found resources:")
    
    let i = 1 
    for(const resource of filteredResources)
        console.log(`resource ${i++}: `, resource)
    
    return filteredResources;
}

function handleDisplayingResources(mediaResources){
    const checked = document.getElementById("showResourcesCheckbox").checked;
    if(!checked){
        document.getElementById("resourcesList").style.display = "none";
        return;
    }
    document.getElementById("resourcesList").style.display = "block";

    // append resources to list
    const listNode = document.getElementById("resourcesList");
    listNode.innerHTML = "";
    for(const resource of mediaResources){
        const listElement = document.createElement("li");
        listElement.innerHTML = `Resolution: ${resource.resolution.name}, ResolutionID: ${resource.resolutionID}, `+
            `isAudioFile: ${resource.isAudioFile},<br>${resource.name}<br>${resource.url}`;
        
        listNode.appendChild(listElement);
        listNode.appendChild(document.createElement("br"));
    }
}


function selectBestMedia(mediaResources){
    function getBestAudioResource(){
        let bestResource = "";
        let resolution = 0;
        for(const resource of mediaResources){
            if(!resource.isAudioFile)
                continue;

            if(resource.resolution.value > resolution){
                bestResource = resource;
                resolution = resource.resolution.value;
            }
        }
        return bestResource;
    }

    function getBestVideoResource(){
        let bestResource = "";
        let resolution = 0;
        for(const resource of mediaResources){
            if(resource.resolution.value > resolution){
                bestResource = resource;
                resolution = resource.resolution.value;
            }
        }
        return bestResource;
    }

    return {
        "video": getBestVideoResource(),
        "audio": getBestAudioResource()
    }
}

async function getVideoTitle(currentTabID){

    function getVideoTitleScript(){
        const videoTitleNode = document.querySelector("div#naglowek > span.title-name > span > h1")
        if(!videoTitleNode){
            return "untitled-node_not_found";
        }

        return videoTitleNode.textContent;
    }

    const injectionResults = await chrome.scripting.executeScript({
        target: {tabId: currentTabID},
        function: getVideoTitleScript
    });

    if(chrome.runtime.lastError){
        console.error("Error reading Video Title")
        return "untitled-script_failed";
    }

    return injectionResults[0].result
}

function addVideoTitleToLabel(videoTitle){
    const label = document.getElementById('videoTitleLabel')
    label.textContent = videoTitle
}

function validateVideoTitle(videoTitle){ // GEMINI
    // 1. Ensure the input is a string and is not empty.
    if (typeof videoTitle !== 'string' || videoTitle.length === 0) {
        return 'untitled-empty1';
    }

    // 2. Define illegal characters for filenames. It's best to use the Windows rules
    //    as they are the most restrictive, ensuring cross-platform compatibility.
    //    The forbidden characters are: < > : " / \ | ? *
    const illegalChars = /[<>:"/\\|?*]/g;

    // 3. Define ASCII control characters (e.g., newline, tab) which are invisible
    //    but can cause issues in filenames.
    const controlChars = /[\x00-\x1f\x7f]/g;

    // 4. Replace illegal and control characters with an underscore '_'.
    let sanitized = videoTitle.replace(illegalChars, '_').replace(controlChars, '_');

    // 5. Remove any leading or trailing dots or spaces,
    //    as they can cause issues on some systems.
    sanitized = sanitized.trim().replace(/^[. ]+|[. ]+$/g, "");

    // 6. Limit the filename length to a safe value (e.g., 200 characters)
    //    to avoid issues with filesystem limits.
    const maxLength = 200;
    sanitized = sanitized.substring(0, maxLength);

    // 7. If the filename is empty after all operations
    //    (e.g., the input was only "?*"), return a default name.
    if (sanitized.length === 0) {
        return 'untitled-empty2';
    }

    return sanitized;
}

function toVideoFileName(validVideoTitle){
    return validVideoTitle + "-video.mp4"
}

function toAudioFileName(validVideoTitle){
    return validVideoTitle + "-audio.mp4"
}

function setVideoFileLabel(resource, videoFileName){
    const label = document.getElementById("videoFileLabel");
    const s1 = document.createElement('span')
    s1.style.opacity = "0.4";
    s1.textContent = `"`
    
    const i = document.createElement('i')
    i.textContent = videoFileName;

    const s2 = document.createElement('span')
    s2.style.opacity = "0.4";
    s2.textContent = `" (${resource.resolution.name})`

    label.appendChild(s1)
    label.appendChild(i)
    label.appendChild(s2)
}

function setAudioFileLabel(resource, audioFileName){
    const label = document.getElementById("audioFileLabel");
    const s1 = document.createElement('span')
    s1.style.opacity = "0.4";
    s1.textContent = `"`
    
    const i = document.createElement('i')
    i.textContent = audioFileName;

    const s2 = document.createElement('span')
    s2.style.opacity = "0.4";
    s2.textContent = `" (${resource.resolution.name})`

    label.appendChild(s1)
    label.appendChild(i)
    label.appendChild(s2)
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(fileName, fileURL) {
    const response = await chrome.runtime.sendMessage({
        action: "download",
        url: fileURL,
        filename: fileName
    });

    if(response.success){
        console.log("file downloaded!");
        await delay(500);
        return true;
    } else {
        console.error("can't download file!: reason:", response.error);
        document.getElementById('errorLabel').textContent = 
            `can't download file!: reason: ${response.error}`
        await delay(500);
        return false;
    }
}

function setVideoDownloadButton(resource, videoFileName){
    const button = document.getElementById("downloadVideoFileButton");
    button.disabled = false;

    button.addEventListener('click', async () => {
        button.disabled = true;
        await downloadFile(videoFileName, resource.url) // holds for 500ms
        button.disabled = false;
    });
}

function setAudioDownloadButton(resource, audioFileName){
    const button = document.getElementById("downloadAudioFileButton");
    button.disabled = false;
    
    button.addEventListener('click', async () => {
        button.disabled = true;
        await downloadFile(audioFileName, resource.url) // holds for 500ms
        button.disabled = false;
    });
}

function addFFmpegCommand(videoFileName, audioFileName, validVideoTitle){
    const label = document.getElementById("ffmpegLabel");
    label.textContent = `ffmpeg -i "${videoFileName}" -i "${audioFileName}" -c:v copy -c:a copy "${validVideoTitle}.mp4"`
}

async function main(){
    const targetPagePrefix = "https://www.cda.pl/" // prefix
    
    // CHECK IF PAGE IS THE TARGET ONE
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if(!tabs || !tabs[0] || !tabs[0].url){
        document.getElementById("hiddenContent").remove();
        document.getElementById("content").innerHTML = "Failed quering active tabs"
        return;
    }

    const currentUrl = tabs[0].url;
    const currentTabID = tabs[0].id
    if(!currentUrl.startsWith(targetPagePrefix)){
        document.getElementById("hiddenContent").remove();
        document.getElementById("content").innerHTML = `Extension works only on "${targetPagePrefix}*" pages`
        return;
    }
    
    // GET ALL RESOURCES
    const allResources = await getAllNetworkResourcesFromCurrentPage(currentTabID);

    // FIND IMPORTANT ONES
    const mediaResources = await findMediaResources(allResources)
    if(mediaResources.length === 0){
        console.warn("no important (video/audio) resources found!")
        document.getElementById("hiddenContent").remove();
        document.getElementById("content").innerHTML = "No resources found" + "<br>" + 
        'Tip: Set the resolution in the player ("auto" resolution is unpredictable) and press play to load the resources. Then, reopen the extension.'
        return;
    }

    // CREATE COMPONENTS FOR TARGET PAGE USAGE
    createComponentsForTargetPageUsage();

    // CONNECT SHOW RESOURCES CHECKBOX WITH FUNCTIONALITY
    document.getElementById("showResourcesCheckbox").onclick = () => {handleDisplayingResources(mediaResources)};
    // AND CALL AT THE SAME TIME, TO HIDE OR SHOW FIELD
    handleDisplayingResources(mediaResources);

    // GAIN VIDEO TITLE FROM THE PAGE
    const videoTitle = await getVideoTitle(currentTabID);
    
    // ADD VIDEO TITLE TO THE LABEL
    addVideoTitleToLabel(videoTitle)

    // PROCESS VIDEO TITLE
    const validVideoTitle = validateVideoTitle(videoTitle);
    const videoFileName = toVideoFileName(validVideoTitle);
    const audioFileName = toAudioFileName(validVideoTitle);

    // FIND BEST RESOURCES AND USE THEM (add them to labels and download buttons)
    const bestResources = selectBestMedia(mediaResources);
    
    setVideoFileLabel(bestResources.video, videoFileName);
    setAudioFileLabel(bestResources.audio, audioFileName)
    
    setVideoDownloadButton(bestResources.video, videoFileName);
    setAudioDownloadButton(bestResources.audio, audioFileName)

    // ADD COMMAND (EASY COPY-PASTE) FOR FFMPEG
    addFFmpegCommand(videoFileName, audioFileName, validVideoTitle);
}
main();
