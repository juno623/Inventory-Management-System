// auth.js

// Signup
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target[0].value;
    const email = e.target[1].value;
    const password = e.target[2].value;
    const confirm = e.target[3].value;

    if (password !== confirm) {
      alert("Passwords do not match!");
      return;
    }

    localStorage.setItem("userName", name);
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userPassword", password);

    alert("Signup successful! Please log_in.");
    window.location.href = "log_in.html";
  });
}

// log_in
const log_Form = document.getElementById("loginForm");
if (log_Form) {
  log_Form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = e.target[0].value;
    const password = e.target[1].value;

    const storedEmail = localStorage.getItem("userEmail");
    const storedPassword = localStorage.getItem("userPassword");

    if (email === storedEmail && password === storedPassword) {
      localStorage.setItem("isLoggedIn", "true");
      window.location.href = "Web.html";
    } else {
      alert("Invalid email or password");
    }
  });
}

// Protect Dashboard
if (window.location.pathname.includes("Web.html")) {
  if (localStorage.getItem("isLoggedIn") !== "true") {
    window.location.href = "log_in.html";
  }
}

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("isLoggedIn");
    window.location.href = "log_in.html";
  });
}
