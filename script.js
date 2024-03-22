const handleAddImage = () => {
    if (!window.location.href.includes("framework/crewai")) {
        requestAnimationFrame(() => {
            handleAddImage();
        });
        return;
    }
    const h1 = document.querySelector("h1");
        const isMobile = window.innerWidth < 768;
    //if h1 doesn't contain image, add it
    if (!h1.querySelector("img")) {
        const img = document.createElement("img");
        img.src = "https://github.com/joaomdmoura/crewAI/raw/main/docs/crewai_logo.png";


        img.style.height = isMobile ? "32px" : "32px";


        h1.insertBefore(img, h1.firstChild);
    }

    h1.style.display = "flex";
    h1.style.justifyContent = "center";
    h1.style.alignItems = "center";
    h1.style.gap = "12px";

    requestAnimationFrame(() => {
        handleAddImage();
    });

}

requestAnimationFrame(handleAddImage);