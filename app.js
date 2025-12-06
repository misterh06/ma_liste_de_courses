
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyBhvX2Z7pTIMuS3i_3xxazjZzJ6SIrDnlE",
    authDomain: "ma-liste-de-courses-1661a.firebaseapp.com",
    projectId: "ma-liste-de-courses-1661a",
    storageBucket: "ma-liste-de-courses-1661a.firebasestorage.app",
    messagingSenderId: "757497204483",
    appId: "1:757497204483:web:generated_for_web_admin"
};

// --- Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const shoppingListCollection = collection(db, "shopping_list");

// --- Constantes (from dart code) ---
const RAYONS = [
    "Apéritif",
    "Boissons",
    "Boucherie, Poissonnerie",
    "Boulangerie, patisserie",
    "Conserves",
    "Epicerie salée",
    "Epicerie sucrée",
    "Epices, sauces",
    "Frais (Charcuterie-Traiteur)",
    "Fruits et légumes",
    "Produits laitiers, fromages",
    "Surgelés",
    "Maison, animaux",
    "Hygiène, beauté",
    "Entretien, nettoyage",
    "Divers",
];

// --- State ---
let articles = [];
let currentFilter = "";
let filterMode = "all"; // 'all' or 'inList'

// --- DOM Elements ---
const articlesList = document.getElementById("articlesList");
const loadingState = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const totalCountEl = document.getElementById("totalCount");
const inListCountEl = document.getElementById("inListCount");
const searchInput = document.getElementById("searchInput");
const modal = document.getElementById("articleModal");
const form = document.getElementById("articleForm");
const rayonSelect = document.getElementById("itemRayon");
const articleIdField = document.getElementById("articleId");

// --- Init UI ---
function init() {
    // Fill Rayons Select
    RAYONS.forEach(rayon => {
        const option = document.createElement("option");
        option.value = rayon;
        option.textContent = rayon;
        rayonSelect.appendChild(option);
    });

    // Event Listeners
    document.getElementById("btnAdd").addEventListener("click", () => openModal());
    document.getElementById("btnCloseModal").addEventListener("click", closeModal);
    document.getElementById("btnCancel").addEventListener("click", closeModal);
    document.getElementById("btnExport").addEventListener("click", exportCSV);
    document.getElementById("btnEmptyCart").addEventListener("click", emptyCart);

    // Auth Events
    document.getElementById("loginForm").addEventListener("submit", handleAuthAction);
    document.getElementById("toggleAuthMode").addEventListener("click", toggleAuthMode);
    document.getElementById("btnLogout").addEventListener("click", () => signOut(auth));

    searchInput.addEventListener("input", (e) => {
        currentFilter = e.target.value.toLowerCase();
        render();
    });

    // Filter Tabs
    document.getElementById("filterAll").addEventListener("click", () => setFilterMode("all"));
    document.getElementById("filterList").addEventListener("click", () => setFilterMode("inList"));
    document.getElementById("filterFavorites").addEventListener("click", () => setFilterMode("favorites"));
    document.getElementById("btnAddFavoritesToCart").addEventListener("click", addFavoritesToCart);

    form.addEventListener("submit", handleFormSubmit);

    // Auth State Listener
    onAuthStateChanged(auth, (user) => {
        const loginContainer = document.getElementById("loginContainer");
        const appContainer = document.getElementById("appContainer");

        if (user) {
            // User is signed in
            loginContainer.classList.add("hidden");
            appContainer.classList.remove("hidden");
            startSync();
        } else {
            // User is signed out
            loginContainer.classList.remove("hidden");
            appContainer.classList.add("hidden");
            // Stop sync if needed? (snapshot listener is robust, but ideally unsubscribe)
        }
    });
}

let unsubscribe = null;

function startSync() {
    if (unsubscribe) unsubscribe();

    // SIMPLIFIED QUERY: Removed orderBy to avoid "Missing Index" errors for now
    const q = query(shoppingListCollection);

    unsubscribe = onSnapshot(q, (snapshot) => {
        articles = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

        // Manual Sort in JS instead of Firestore
        articles.sort((a, b) => {
            const rA = a.rayon || "Divers";
            const rB = b.rayon || "Divers";
            if (rA !== rB) return rA.localeCompare(rB);
            return (a.item || "").localeCompare(b.item || "");
        });

        updateStats();
        render();
        loadingState.classList.add("hidden");
    }, (error) => {
        console.error("Error fetching data:", error);
        let msg = "Erreur inconnue : " + error.message;
        if (error.code === 'permission-denied') {
            msg = "Permission refusée. Vous êtes connecté, mais la base de données refuse l'accès. (Règles de sécurité ?)";
        }
        if (error.message.includes("indexes")) {
            msg = "Erreur d'index : La base de données nécessite une configuration (index composite).";
        }

        // Show error strictly
        loadingState.innerHTML = `<div style="color:var(--danger); text-align:center"><p><strong>Erreur de chargement</strong></p><p>${msg}</p></div>`;
    });
}

let isLoginMode = true;

function toggleAuthMode(e) {
    e.preventDefault();
    isLoginMode = !isLoginMode;

    const title = isLoginMode ? "Connexion" : "Créer un compte";
    const btnText = isLoginMode ? "Se connecter" : "S'inscrire";
    const toggleText = isLoginMode ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter";

    document.getElementById("authTitle").textContent = title;
    document.getElementById("btnAuthSubmit").textContent = btnText;
    document.getElementById("toggleAuthMode").textContent = toggleText;
    document.getElementById("loginError").classList.add("hidden");
}

async function handleAuthAction(e) {
    e.preventDefault();
    const email = document.getElementById("emailInput").value;
    const password = document.getElementById("passwordInput").value;
    const loginError = document.getElementById("loginError");

    try {
        loginError.classList.add("hidden");
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error(error);
        let msg = "Erreur : " + error.message;
        if (error.code === 'auth/email-already-in-use') msg = "Cet email est déjà utilisé.";
        if (error.code === 'auth/weak-password') msg = "Le mot de passe doit faire au moins 6 caractères.";
        if (error.code === 'auth/invalid-email') msg = "Email invalide.";
        loginError.textContent = msg;
        loginError.classList.remove("hidden");
    }
}

// --- Render ---
// Track which rayons are open
let openRayons = new Set();

function render() {
    // Save currently open rayons before clearing
    document.querySelectorAll('#articlesList details[open]').forEach(d => {
        const rayonName = d.querySelector('summary')?.textContent.replace(/\s*\(\d+\)\s*$/, '');
        if (rayonName) openRayons.add(rayonName);
    });
    // Also track closed ones to remove from set
    document.querySelectorAll('#articlesList details:not([open])').forEach(d => {
        const rayonName = d.querySelector('summary')?.textContent.replace(/\s*\(\d+\)\s*$/, '');
        if (rayonName) openRayons.delete(rayonName);
    });

    articlesList.innerHTML = "";

    // 1. Filter
    let filteredArticles = articles;

    // Tab Filter
    if (filterMode === "inList") {
        filteredArticles = filteredArticles.filter(a => a.isInCourses);
    } else if (filterMode === "favorites") {
        filteredArticles = filteredArticles.filter(a => a.isFavorite);
    }

    // Search Filter
    if (currentFilter) {
        filteredArticles = filteredArticles.filter(a =>
            (a.item || "").toLowerCase().includes(currentFilter) ||
            (a.reference || "").toLowerCase().includes(currentFilter)
        );
    }

    if (filteredArticles.length === 0 && articles.length > 0) {
        articlesList.innerHTML = `<div style="text-align:center; padding: 20px;">Aucun résultat pour "${currentFilter}"</div>`;
        return;
    } else if (articles.length === 0) {
        emptyState.classList.remove("hidden");
        return;
    } else {
        emptyState.classList.add("hidden");
    }

    // 2. Group by Rayon
    const grouped = {};

    filteredArticles.forEach(article => {
        const r = article.rayon || "Divers";
        if (!grouped[r]) grouped[r] = [];
        grouped[r].push(article);
    });

    // Sort Rayons based on predefined list index
    const sortedRayons = Object.keys(grouped).sort((a, b) => {
        let idxA = RAYONS.indexOf(a);
        let idxB = RAYONS.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    // 3. Build UI
    sortedRayons.forEach(rayon => {
        const groupArticles = grouped[rayon];

        // Sort articles
        groupArticles.sort((a, b) => (a.item || "").localeCompare(b.item || ""));

        const details = document.createElement("details");
        // Preserve open state OR open if searching/filtering
        const shouldBeOpen = openRayons.has(rayon) || currentFilter.length > 0 || filterMode === 'inList';
        details.open = shouldBeOpen;

        const summary = document.createElement("summary");
        summary.textContent = `${rayon} (${groupArticles.length})`;
        details.appendChild(summary);

        const contentDiv = document.createElement("div");
        contentDiv.className = "details-content";

        // Create table for this group
        const table = document.createElement("table");
        table.className = "group-table";
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 40%">Article</th>
                    <th style="width: 20%">Référence</th>
                    <th style="width: 25%">État</th>
                    <th style="width: 15%; text-align: right">Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector("tbody");

        groupArticles.forEach(article => {
            const isInList = article.isInCourses;
            const statusBadge = isInList
                ? `<span class="status-badge status-active clickable" onclick="window.toggleInCart('${article.id}')" title="Cliquer pour retirer du panier"><span class="material-symbols-rounded" style="font-size:16px;">shopping_cart</span> Dans la liste</span>`
                : `<span class="status-badge status-inactive clickable" onclick="window.toggleInCart('${article.id}')" title="Cliquer pour ajouter au panier"><span class="material-symbols-rounded" style="font-size:16px;">add_shopping_cart</span> Ajouter</span>`;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <strong>${escapeHtml(article.item)}</strong>
                </td>
                <td><code style="background:rgba(251,191,36,0.15); padding:4px 8px; border-radius:6px; font-size: 0.9em">${escapeHtml(article.reference || "-")}</code></td>
                <td>${statusBadge}</td>
                <td class="actions-col">
                    <div class="actions-cell">
                        <button class="btn-icon btn-star ${article.isFavorite ? 'active' : ''}" title="${article.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}" onclick="window.toggleFavorite('${article.id}')">
                            <span class="material-symbols-rounded">${article.isFavorite ? 'star' : 'star_border'}</span>
                        </button>
                        <button class="btn-icon" title="Modifier" onclick="window.editArticle('${article.id}')">
                            <span class="material-symbols-rounded">edit</span>
                        </button>
                        <button class="btn-icon" style="color:var(--danger)" title="Supprimer" onclick="window.deleteArticle('${article.id}')">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        contentDiv.appendChild(table);
        details.appendChild(contentDiv);
        articlesList.appendChild(details);
    });
}

function setFilterMode(mode) {
    filterMode = mode;

    // Update active tab styles
    document.getElementById("filterAll").classList.toggle("active", mode === "all");
    document.getElementById("filterList").classList.toggle("active", mode === "inList");
    document.getElementById("filterFavorites").classList.toggle("active", mode === "favorites");

    // Show/hide "Add favorites to cart" button
    document.getElementById("btnAddFavoritesToCart").classList.toggle("hidden", mode !== "favorites");

    render();
}

function updateStats() {
    totalCountEl.textContent = articles.length;
    inListCountEl.textContent = articles.filter(a => a.isInCourses).length;
}

// --- Actions ---
window.editArticle = (id) => {
    const article = articles.find(a => a.id === id);
    if (!article) return;
    openModal(article);
};

window.deleteArticle = async (id) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) {
        try {
            await deleteDoc(doc(db, "shopping_list", id));
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la suppression.");
        }
    }
};

window.toggleInCart = async (id) => {
    const article = articles.find(a => a.id === id);
    if (!article) return;

    try {
        await updateDoc(doc(db, "shopping_list", id), {
            isInCourses: !article.isInCourses
        });
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la mise à jour.");
    }
};

window.toggleFavorite = async (id) => {
    const article = articles.find(a => a.id === id);
    if (!article) return;

    try {
        await updateDoc(doc(db, "shopping_list", id), {
            isFavorite: !article.isFavorite
        });
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la mise à jour.");
    }
};

async function addFavoritesToCart() {
    const favorites = articles.filter(a => a.isFavorite && !a.isInCourses);

    if (favorites.length === 0) {
        alert("Aucun favori à ajouter (ils sont peut-être déjà dans le panier).");
        return;
    }

    try {
        const promises = favorites.map(a =>
            updateDoc(doc(db, "shopping_list", a.id), { isInCourses: true })
        );
        await Promise.all(promises);
    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'ajout des favoris.");
    }
}

function openModal(article = null) {
    modal.classList.remove("hidden");
    if (article) {
        document.getElementById("modalTitle").textContent = "Modifier l'article";
        articleIdField.value = article.id;
        document.getElementById("itemName").value = article.item;
        document.getElementById("itemRayon").value = article.rayon || RAYONS[0];
        document.getElementById("itemRef").value = article.reference || "";
    } else {
        document.getElementById("modalTitle").textContent = "Nouvel Article";
        form.reset();
        articleIdField.value = "";
        document.getElementById("itemRayon").value = RAYONS[0]; // Default
    }
}

function closeModal() {
    modal.classList.add("hidden");
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = articleIdField.value;
    const data = {
        item: document.getElementById("itemName").value,
        rayon: document.getElementById("itemRayon").value,
        reference: document.getElementById("itemRef").value,
        // Preserve existing fields if not editing
    };

    try {
        if (id) {
            await updateDoc(doc(db, "shopping_list", id), data);
        } else {
            // Defaults for new items
            data.isInCourses = false;
            data.isChecked = false;
            await addDoc(shoppingListCollection, data);
        }
        closeModal();
    } catch (err) {
        console.error(err);
        alert("Erreur lors de l'enregistrement.");
    }
}

// --- Empty Cart ---
async function emptyCart() {
    const articlesInCart = articles.filter(a => a.isInCourses);

    if (articlesInCart.length === 0) {
        alert("Le panier est déjà vide !");
        return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir vider le panier ? (${articlesInCart.length} articles seront retirés)`)) {
        return;
    }

    try {
        // Update all articles in cart to set isInCourses = false and isChecked = false
        const promises = articlesInCart.map(a =>
            updateDoc(doc(db, "shopping_list", a.id), { isInCourses: false, isChecked: false })
        );
        await Promise.all(promises);
    } catch (e) {
        console.error(e);
        alert("Erreur lors du vidage du panier.");
    }
}

// --- Export ---
function exportCSV() {
    const articlesInList = articles.filter(a => a.isInCourses);

    if (articlesInList.length === 0) {
        alert("Votre liste de courses est vide. Rien à exporter !");
        return;
    }

    // Sort by Rayon, then by Name
    articlesInList.sort((a, b) => {
        const rA = a.rayon || "Divers";
        const rB = b.rayon || "Divers";
        if (rA !== rB) return rA.localeCompare(rB);
        return (a.item || "").localeCompare(b.item || "");
    });

    const dataToExport = articlesInList.map(a => ({
        Article: a.item,
        Reference: a.reference || ""
    }));

    const csv = Papa.unparse(dataToExport);

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mes_courses_liste.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Security: helpers
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

init();

