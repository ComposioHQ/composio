document.getElementById('generate-btn').addEventListener('click', generateQRCode);

function generateQRCode() {
    const content = document.getElementById('content').value;
    const expirationDays = parseInt(document.getElementById('expiration').value);
    
    if (!content) {
        alert("Please enter content for the QR code.");
        return;
    }

    // Show loading GIF
    document.getElementById('loading-gif').classList.remove('hidden');
    document.getElementById('qr-code').classList.add('hidden');
    document.getElementById('expiry-message').classList.add('hidden');

    // Simulate QR code generation delay with a timeout (1.5 seconds)
    setTimeout(() => {
        // Hide loading GIF after QR code is generated
        document.getElementById('loading-gif').classList.add('hidden');

        // Calculate expiration date
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + expirationDays);
        
        // Generate the QR code
        const qrCodeContainer = document.getElementById('qr-code');
        qrCodeContainer.innerHTML = ''; // Clear previous QR codes

        const qrCode = new QRCode(qrCodeContainer, {
            text: content,
            width: 200,
            height: 200,
        });

        // Save QR code data in local storage
        const qrData = {
            content: content,
            expiration: expirationDate.getTime() // Save expiration as timestamp
        };
        localStorage.setItem('qrCodeData', JSON.stringify(qrData));

        // Show the QR code and expiration info
        document.getElementById('qr-code').classList.remove('hidden');
        document.getElementById('expiry-message').classList.remove('hidden');
        document.getElementById('expiry-message').innerText = `QR code will expire on ${expirationDate.toLocaleString()}`;
    }, 1500);
}

// Check if a previously generated QR code has expired
window.onload = function() {
    const qrData = JSON.parse(localStorage.getItem('qrCodeData'));

    if (qrData) {
        const currentDate = new Date().getTime();
        const expirationDate = qrData.expiration;

        if (currentDate < expirationDate) {
            // QR code is still valid, regenerate it
            const qrCodeContainer = document.getElementById('qr-code');
            const qrCode = new QRCode(qrCodeContainer, {
                text: qrData.content,
                width: 200,
                height: 200,
            });
            
            document.getElementById('qr-code').classList.remove('hidden');
            document.getElementById('expiry-message').classList.remove('hidden');
            document.getElementById('expiry-message').innerText = `QR code will expire on ${new Date(expirationDate).toLocaleString()}`;
        } else {
            // QR code has expired
            localStorage.removeItem('qrCodeData');
            alert("The QR code has expired!");
        }
    }
}
