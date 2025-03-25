document.addEventListener('DOMContentLoaded', function() {
    // Get references to sections
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    
    // Get references to navigation links
    const showSignupLink = document.getElementById('show-signup');
    const showLoginLink = document.getElementById('show-login');
    
    // Get references to forms
    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');

    // Show signup section
    showSignupLink.addEventListener('click', function(e) {
        e.preventDefault();
        loginSection.style.display = 'none';
        signupSection.style.display = 'block';
    });

    // Show login section
    showLoginLink.addEventListener('click', function(e) {
        e.preventDefault();
        signupSection.style.display = 'none';
        loginSection.style.display = 'block';
    });

    // Handle Signup
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();

        let username = document.getElementById('signup-name').value;
        let email = document.getElementById('signup-email').value;
        let password = document.getElementById('signup-password').value;
        let confirmPassword = document.getElementById('confirm-password').value;

        if (password !== confirmPassword) {
            alert("Passwords do not match!");
            return;
        }

        let users = JSON.parse(localStorage.getItem('users')) || [];

        // Check if username already exists
        if (users.some(user => user.username === username)) {
            alert("Username already taken. Try another one.");
            return;
        }

        // Save new user
        users.push({ username, email, password });
        localStorage.setItem('users', JSON.stringify(users));

        alert("Account created successfully! You can now log in.");
        signupSection.style.display = 'none';
        loginSection.style.display = 'block';
    });

    // Handle Login
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        let username = document.getElementById('login-username').value;
        let password = document.getElementById('login-password').value;

        let users = JSON.parse(localStorage.getItem('users')) || [];

        let validUser = users.find(user => user.username === username && user.password === password);

        if (validUser) {
            alert("Login successful!");
            window.location.href = "dashboard.html"; // Redirect to dashboard
        } else {
            alert("Invalid username or password.");
        }
    });
});
