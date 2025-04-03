document.addEventListener('DOMContentLoaded', async function () {
    // Encryption key storage name
    const ENCRYPTION_KEY_STORAGE = 'encryption_key';
    
    // Load valid users from JSON
    let validUsers = [];
    
    try {
        const response = await fetch('users.json');
        const data = await response.json();
        validUsers = data.validUsers || [];
        console.log("Loaded valid users:", validUsers);
    } catch (error) {
        console.error("Error loading valid users:", error);
    }

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
    
    // Save password with encryption
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
    
    // Display passwords with decryption
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
                const passwordItems = await Promise.all(userPasswords.map(async (item, index) => {
                    try {
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
                
                // Attach event listeners
                document.querySelectorAll('.toggle-btn').forEach(button => {
                    button.addEventListener('click', function() {
                        const index = this.getAttribute('data-index');
                        const passwordInput = document.getElementById(`password-${index}`);
                        passwordInput.type = passwordInput.type === "password" ? "text" : "password";
                        this.textContent = passwordInput.type === "password" ? "Show" : "Hide";
                    });
                });

                document.querySelectorAll('.edit-btn').forEach(button => {
                    button.addEventListener('click', async function() {
                        const index = this.getAttribute('data-index');
                        const newPassword = prompt("Enter new password:");
                        if (newPassword) {
                            try {
                                const keyData = await getEncryptionKey(username);
                                const key = await importKey(keyData);
                                const encryptedPassword = await encryptData(key, newPassword);
                                const encryptedPasswordStr = Array.from(encryptedPassword).join(',');
                                
                                userPasswords[index].password = encryptedPasswordStr;
                                localStorage.setItem(username + '_passwords', JSON.stringify(userPasswords));
                                displayPasswords(username);
                            } catch (error) {
                                console.error("Error updating password:", error);
                                alert("Error updating password.");
                            }
                        }
                    });
                });

                document.querySelectorAll('.delete-btn').forEach(button => {
                    button.addEventListener('click', function() {
                        const index = this.getAttribute('data-index');
                        userPasswords.splice(index, 1);
                        localStorage.setItem(username + '_passwords', JSON.stringify(userPasswords));
                        displayPasswords(username);
                    });
                });
            }
        } catch (error) {
            console.error("Error loading passwords:", error);
            passwordListContainer.innerHTML = "<p class='error'>Error loading passwords. Please try again.</p>";
        }
    }

    // Check current user on load
    let currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        document.getElementById('username').innerText = currentUser;
        displayPasswords(currentUser);
    }

    // Login form submission
    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        // Check against JSON valid users or localStorage
        const isValidUser = validUsers.some(user => 
            user.username === username && user.password === password
        ) || localStorage.getItem(username) === password;

        if (isValidUser) {
            localStorage.setItem('currentUser', username);
            // Store password in localStorage if it's from JSON
            if (!localStorage.getItem(username)) {
                localStorage.setItem(username, password);
            }
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('username').innerText = username;
            displayPasswords(username);
        } else {
            alert("Invalid credentials.");
        }
    });

    // Signup form submission
    document.getElementById('signup-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('signup-name').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (password !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        // Check if username exists in JSON or localStorage
        const userExists = validUsers.some(user => user.username === username) || 
                          localStorage.getItem(username);

        if (userExists) {
            alert("Username already exists.");
            return;
        }

        // Store in localStorage
        localStorage.setItem(username, password);
        alert("Account created successfully!");
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    // Navigation between forms
    document.getElementById('show-signup').addEventListener('click', function() {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', function() {
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    // Logout
    document.getElementById('logout').addEventListener('click', function() {
        localStorage.removeItem('currentUser');
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    // Password strength indicator
    const passwordInput = document.getElementById('signup-password');
    const passwordStrengthDiv = document.getElementById('password-strength');

    passwordInput.addEventListener('input', function() {
        const password = passwordInput.value;
        let strength = 0;
        if (password.length > 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;

        let color = "#e0e0e0";
        switch(strength) {
            case 1: color = "#ff0000"; break;
            case 2: color = "#ff9900"; break;
            case 3: color = "#66cc00"; break;
            case 4: color = "#00cc00"; break;
        }
        passwordStrengthDiv.innerHTML = `<span style="width: ${strength * 25}%; background-color: ${color};"></span>`;
    });

    // Save password button
    document.getElementById('save-password').addEventListener('click', async function() {
        if (!currentUser) return;
        
        const siteName = document.getElementById('site-name').value;
        const siteUsername = document.getElementById('site-username').value;
        const sitePassword = document.getElementById('site-password').value;

        if (!siteName || !siteUsername || !sitePassword) {
            alert("Please fill all fields.");
            return;
        }

        const result = await savePassword(currentUser, siteName, siteUsername, sitePassword);
        alert(result.message);
        
        if (result.success) {
            displayPasswords(currentUser);
            document.getElementById('site-name').value = '';
            document.getElementById('site-username').value = '';
            document.getElementById('site-password').value = '';
        }
    });
});
