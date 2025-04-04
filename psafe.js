document.addEventListener('DOMContentLoaded', async function () {
    // Encryption key storage name
    const ENCRYPTION_KEY_STORAGE = 'encryption_key';
    
    // Load valid users from JSON
    let validUsers = [];
    
    try {
        const response = await fetch('Users.json');
        const data = await response.json();
        validUsers = data.validUsers || [];
    } catch (error) {
        console.error("Error loading valid users:", error);
    }

    // Password Generator
    function generatePassword(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        const cryptoArray = new Uint8Array(length);
        crypto.getRandomValues(cryptoArray);
        return Array.from(cryptoArray).map(byte => chars[byte % chars.length]).join('');
    }

    // Password Strength Meter
    function getPasswordStrength(password) {
        let strength = 0;
        if (password.length > 12) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return strength;
    }

    function updateStrengthMeter(password, meterId = 'password-strength') {
        const strength = getPasswordStrength(password);
        const bar = document.querySelector(`#${meterId} .strength-bar`);
        const text = document.querySelector(`#${meterId} .strength-text`);
        
        const colors = ['#ff0000', '#ff5e00', '#ffbb00', '#fff700', '#a4ff00', '#00ff00'];
        const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
        
        bar.style.width = `${(strength / 5) * 100}%`;
        bar.style.background = colors[strength];
        text.textContent = labels[strength];
        text.style.color = colors[strength];
    }

    // Generate or retrieve encryption key
    async function getEncryptionKey(username) {
        const keyName = `${username}_${ENCRYPTION_KEY_STORAGE}`;
        let keyData = localStorage.getItem(keyName);
        
        if (!keyData) {
            const key = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            
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
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(data);
        
        const encryptedData = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encodedData
        );
        
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
            
            const encryptedPassword = await encryptData(key, sitePassword);
            const encryptedPasswordStr = Array.from(encryptedPassword).join(',');
            
            let userPasswords = JSON.parse(localStorage.getItem(username + '_passwords')) || [];
            
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
                                const keyData = await getEncryptionKey(currentUser);
                                const key = await importKey(keyData);
                                const encryptedPassword = await encryptData(key, newPassword);
                                const encryptedPasswordStr = Array.from(encryptedPassword).join(',');
                                
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
                    button.addEventListener('click', function() {
                        const index = this.getAttribute('data-index');
                        userPasswords.splice(index, 1);
                        localStorage.setItem(currentUser + '_passwords', JSON.stringify(userPasswords));
                        displayPasswords(currentUser);
                    });
                });
            }
        } catch (error) {
            console.error("Error loading passwords:", error);
            passwordListContainer.innerHTML = "<p class='error'>Error loading passwords. Please try again.</p>";
        }
    }

    // Event Listeners
    document.getElementById('generate-password').addEventListener('click', () => {
        const password = generatePassword();
        document.getElementById('site-password').value = password;
        updateStrengthMeter(password, 'new-password-strength');
    });

    document.getElementById('site-password').addEventListener('input', (e) => {
        updateStrengthMeter(e.target.value, 'new-password-strength');
    });

    document.getElementById('signup-password').addEventListener('input', (e) => {
        updateStrengthMeter(e.target.value);
    });

    let currentUser = localStorage.getItem('currentUser');

    if (currentUser) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        document.getElementById('username').innerText = currentUser;
        displayPasswords(currentUser);
    }

    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        const isValidUser = validUsers.some(user => 
            user.username === username && user.password === password
        ) || localStorage.getItem(username) === password;

        if (isValidUser) {
            localStorage.setItem('currentUser', username);
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

    document.getElementById('signup-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('signup-name').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (password !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        const userExists = validUsers.some(user => user.username === username) || 
                          localStorage.getItem(username);

        if (userExists) {
            alert("Username already exists.");
            return;
        }

        localStorage.setItem(username, password);
        alert("Account created successfully!");
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    document.getElementById('show-signup').addEventListener('click', function() {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', function() {
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

    document.getElementById('logout').addEventListener('click', function() {
        localStorage.removeItem('currentUser');
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    });

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
