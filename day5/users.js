// ---------- Select elements ----------
const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusText = document.getElementById("status");
const usersList = document.getElementById("users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// Every user we downloaded. The filter works on this array,
// so typing in the box never makes a new request.
let allUsers = [];

// ---------- Status helper ----------
function setStatus(message, isError) {
  statusText.textContent = message;
  statusText.classList.toggle("error", Boolean(isError));
}

// ---------- Show users on the page ----------
function renderUsers() {
  const searchText = filterInput.value.trim().toLowerCase();

  const matches = allUsers.filter(function (user) {
    return user.name.toLowerCase().includes(searchText);
  });

  usersList.textContent = "";

  matches.forEach(function (user) {
    const item = document.createElement("li");

    const name = document.createElement("h2");
    name.textContent = user.name;

    const email = document.createElement("p");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("p");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("p");
    company.textContent = "Company: " + user.company.name;

    item.append(name, email, city, company);
    usersList.appendChild(item);
  });

  // Only update the message once users have been loaded
  if (allUsers.length > 0) {
    if (matches.length === 0) {
      setStatus("No users match your filter.");
    } else {
      setStatus("Showing " + matches.length + " of " + allUsers.length + " users.");
    }
  }
}

// ---------- Fetch users from the API ----------
async function loadUsers() {
  setStatus("Loading users...");
  loadButton.disabled = true;

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("The server replied with status " + response.status);
    }

    allUsers = await response.json();
    renderUsers();
    setStatus("Loaded " + allUsers.length + " users.");
  } catch (error) {
    allUsers = [];
    usersList.textContent = "";
    setStatus("Could not load users: " + error.message, true);
  } finally {
    loadButton.disabled = false;
  }
}

// ---------- Events ----------
loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", renderUsers);
