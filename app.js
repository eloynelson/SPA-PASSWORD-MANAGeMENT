document.addEventListener('DOMContentLoaded', function () {
    // Encryption key storage name
    const ENCRYPTION_KEY_STORAGE = 'encryption_key';
    
    // Generate or retrieve encryption key
    async function getEncryptionKey(username) {
        const keyName = `${username}_${ENCRYPTION_KEY_STORAGE}`;
        let keyData = localStorage.getItem(keyName);
        
        if (!keyData) {
            // Generate a new key if none exists
            const key = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            
            // Export the key and store it
            const exportedKey = await crypto.subtle.exportKey("jwk", key);
            keyData = JSON.stringify(exportedKey);
            localStorage.setItem(keyName, keyData);
        }
        
        return JSON.parse(keyData);
    }
    
    // Convert JWK back to CryptoKey
    async function importKey(keyData) {
        return await crypto.subtle.importKey(
            "jwk",
            keyData,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }
    
    // Encrypt data
    async function encryptData(key, data) {
        const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector
        const encodedData = new TextEncoder().encode(data);
        
        const encryptedData = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encodedData
        );
        
        // Combine IV and encrypted data for storage
        const combined = new Uint8Array(iv.length + encryptedData.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encryptedData), iv.length);
        
        return combined;
    }
    
    // Decrypt data
    async function decryptData(key, combinedData) {
        const iv = combinedData.slice(0, 12);
        const encryptedData = combinedData.slice(12);
        
        const decryptedData = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encryptedData
        );
        
        return new TextDecoder().decode(decryptedData);
    }
    
    // Modified savePassword function with encryption
    async function savePassword(username, site, siteUsername, sitePassword) {
        try {
            const keyData = await getEncryptionKey(username);
            const key = await importKey(keyData);
            
            // Encrypt the password before storing
            const encryptedPassword = await encryptData(key, sitePassword);
            
            // Convert Uint8Array to string for localStorage
            const encryptedPasswordStr = Array.from(encryptedPassword).join(',');
            
            let userPasswords = JSON.parse(localStorage.getItem(username + '_passwords')) || [];
            
            // Check for duplicates
            const duplicate = userPasswords.some(item => 
                item.site === site && item.username === siteUsername
            );
            
            if (duplicate) {
                return { success: false, message: "Password for this site and username already exists." };
            }
            
            userPasswords.push({ 
                site: site, 
                username: siteUsername, 
                password: encryptedPasswordStr 
            });
            
            localStorage.setItem(username + '_passwords', JSON.stringify(userPasswords));
            return { success: true, message: "Password saved successfully!" };
        } catch (error) {
            console.error("Encryption error:", error);
            return { success: false, message: "Error saving password." };
        }
    }
    
    // Modified displayPasswords function with decryption
    async function displayPasswords(username) {
        let passwordListContainer = document.getElementById('password-list-container');
        passwordListContainer.innerHTML = "";

        try {
            const keyData = await getEncryptionKey(username);
            const key = await importKey(keyData);
            
            let userPasswords = JSON.parse(localStorage.getItem(username + '_passwords')) || [];
            
            if (userPasswords.length === 0) {
                passwordListContainer.innerHTML = "<p>No saved passwords yet.</p>";
            } else {
                // Process passwords in parallel for better performance
                const passwordItems = await Promise.all(userPasswords.map(async (item, index) => {
                    try {
                        // Convert stored string back to Uint8Array
                        const encryptedData = new Uint8Array(item.password.split(',').map(Number));
                        const decryptedPassword = await decryptData(key, encryptedData);
                        
                        return `
                            <div class="password-item">
                                <div class="password-info">
                                    <strong>${item.site}</strong>
                                    <p>Username: ${item.username}</p>
                                    <input type="password" value="${decryptedPassword}" class="password-field" id="password-${index}" readonly>
                                </div>
                                <div class="password-actions">
                                    <button class="toggle-btn" data-index="${index}">Show</button>
                                    <button class="edit-btn" data-index="${index}">Edit</button>
                                    <button class="delete-btn" data-index="${index}">Delete</button>
                                </div>
                            </div>
                        `;
                    } catch (error) {
                        console.error("Decryption error for item", index, error);
                        return `
                            <div class="password-item">
                                <div class="password-info">
                                    <strong>${item.site}</strong>
                                    <p>Username: ${item.username}</p>
                                    <p class="error">Error decrypting password</p>
                                </div>
                                <div class="password-actions">
                                    <button class="delete-btn" data-index="${index}">Delete</button>
                                </div>
                            </div>
                        `;
                    }
                }));
                
                passwordListContainer.innerHTML = passwordItems.join('');
                
                // Reattach event listeners
                document.querySelectorAll('.toggle-btn').forEach(button => {
                    button.addEventListener('click', function () {
                        let index = this.getAttribute('data-index');
                        let passwordInput = document.getElementById('password-' + index);

                        if (passwordInput.type === "password") {
                            passwordInput.type = "text";
                            this.innerText = "Hide";
                        } else {
                            passwordInput.type = "password";
                            this.innerText = "Show";
                        }
                    });
                });

                document.querySelectorAll('.edit-btn').forEach(button => {
                    button.addEventListener('click', async function () {
                        let index = this.getAttribute('data-index');
                        let newPassword = prompt("Enter new password:");

                        if (newPassword !== null && newPassword.trim() !== "") {
                            try {
                                const keyData = await getEncryptionKey(currentUser);
                                const key = await importKey(keyData);
                                const encryptedPassword = await encryptData(key, newPassword);
                                const encryptedPasswordStr = Array.from(encryptedPassword).join(',');
                                
                                let userPasswords = JSON.parse(localStorage.getItem(currentUser + '_passwords')) || [];
                                userPasswords[index].password = encryptedPasswordStr;
                                localStorage.setItem(currentUser + '_passwords', JSON.stringify(userPasswords));
                                displayPasswords(currentUser);
                            } catch (error) {
                                console.error("Error updating password:", error);
                                alert("Error updating password.");
                            }
                        }
                    });
                });

                document.querySelectorAll('.delete-btn').forEach(button => {
                    button.addEventListener('click', function () {
                        let index = this.getAttribute('data-index');
                        let userPasswords = JSON.parse(localStorage.getItem(currentUser + '_passwords')) || [];
                        userPasswords.splice(index, 1);
                        localStorage.setItem(currentUser + '_passwords', JSON.stringify(userPasswords));
                        displayPasswords(currentUser);
                    });
                });
            }
        } catch (error) {
            console.error("Error initializing decryption:", error);
            passwordListContainer.innerHTML = "<p class='error'>Error loading passwords. Please try again.</p>";
        }
    }

    let currentUser = localStorage.getItem('currentUser');

    if (!currentUser) {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'none';
    } else {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        document.getElementById('username').innerText = currentUser;
        displayPasswords(currentUser); // Show user passwords
    }

    // Login functionality
    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        let username = document.getElementById('login-username').value;
        let password = document.getElementById('login-password').value;

        if (localStorage.getItem(username) === password) {
            localStorage.setItem('currentUser', username);
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('signup-section').style.display = 'none';
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('username').innerText = username;
            displayPasswords(username);
        } else {
            alert("Invalid credentials.");
        }
    });

    // Signup functionality
    document.getElementById('signup-form').addEventListener('submit', function (e) {
        e.preventDefault();
        let username = document.getElementById('signup-name').value;
        let password = document.getElementById('signup-password').value;
        let confirmPassword = document.getElementById('confirm-password').value;

        if (password !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        if (localStorage.getItem(username)) {
            alert("Username already exists.");
            return;
        }

        localStorage.setItem(username, password);
        alert("Account created successfully!");
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    // Show signup form
    document.getElementById('show-signup').addEventListener('click', function () {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
    });

    // Show login form
    document.getElementById('show-login').addEventListener('click', function () {
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    // Logout functionality
    document.getElementById('logout').addEventListener('click', function () {
        localStorage.removeItem('currentUser');
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    // Password strength indicator
    const passwordInput = document.getElementById('signup-password');
    const passwordStrengthDiv = document.getElementById('password-strength');

    passwordInput.addEventListener('input', function () {
        const password = passwordInput.value;
        let strength = getPasswordStrength(password);
        updateStrengthIndicator(strength);
    });

    // Function to calculate password strength
    function getPasswordStrength(password) {
        let strength = 0;
        if (password.length > 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

        return strength;
    }

    // Function to update the strength indicator
    function updateStrengthIndicator(strength) {
        let strengthColor = "#e0e0e0"; // Default: gray
        switch (strength) {
            case 1:
                strengthColor = "#ff0000"; // Weak
                break;
            case 2:
                strengthColor = "#ff9900"; // Fair
                break;
            case 3:
                strengthColor = "#66cc00"; // Good
                break;
            case 4:
                strengthColor = "#00cc00"; // Strong
                break;
        }
        passwordStrengthDiv.innerHTML = `<span style="width: ${strength * 25}% ; background-color: ${strengthColor};"></span>`;
    }

    // Modified save password event listener
    document.getElementById('save-password').addEventListener('click', async function () {
        let siteName = document.getElementById('site-name').value;
        let siteUsername = document.getElementById('site-username').value;
        let sitePassword = document.getElementById('site-password').value;

        if (!siteName || !siteUsername || !sitePassword) {
            alert("Please fill all fields.");
            return;
        }

        const result = await savePassword(currentUser, siteName, siteUsername, sitePassword);
        alert(result.message);
        
        if (result.success) {
            displayPasswords(currentUser);
            // Clear the form
            document.getElementById('site-name').value = '';
            document.getElementById('site-username').value = '';
            document.getElementById('site-password').value = '';
        }
    });
});
