import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, getDocs, where, FieldValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
const menusCollection = collection(db, "menus");
const shoppingListCollection = collection(db, "shopping_list");

// --- Categories ---
const CATEGORIES = ["rapide", "Apéritif", "gourmet", "familiale", "menu de la semaine"];

// --- State ---
let menus = [];
let shoppingListItems = [];
let currentCategoryFilter = "all";
let selectedStars = 1;
let selectedMenuItems = [];
let editingMenuId = null;
let addToCartMenuDoc = null;

// --- DOM Elements ---
const menusList = document.getElementById("menusList");
const loadingState = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const modal = document.getElementById("menuModal");
const form = document.getElementById("menuForm");
const rayonSelect = document.getElementById("rayonSelect");
const articleSelect = document.getElementById("articleSelect");
const selectedArticlesContainer = document.getElementById("selectedArticles");
const addToCartModal = document.getElementById("addToCartModal");

// --- Init UI ---
function init() {
    // Event Listeners
    document.getElementById("btnAddMenu").addEventListener("click", () => openModal());
    document.getElementById("btnCloseModal").addEventListener("click", closeModal);
    document.getElementById("btnCancel").addEventListener("click", closeModal);
    document.getElementById("btnResetMenus").addEventListener("click", resetMenus);
    document.getElementById("btnAddArticle").addEventListener("click", addArticleToMenu);
    document.getElementById("btnConfirmAddToCart").addEventListener("click", confirmAddToCart);

    // Auth Events
    document.getElementById("loginForm").addEventListener("submit", handleAuthAction);
    document.getElementById("toggleAuthMode").addEventListener("click", toggleAuthMode);
    document.getElementById("btnLogout").addEventListener("click", () => signOut(auth));

    // Category Filter Tabs
    document.getElementById("filterAll").addEventListener("click", () => setCategoryFilter("all"));
    document.getElementById("filterRapide").addEventListener("click", () => setCategoryFilter("rapide"));
    document.getElementById("filterAperitif").addEventListener("click", () => setCategoryFilter("Apéritif"));
    document.getElementById("filterGourmet").addEventListener("click", () => setCategoryFilter("gourmet"));
    document.getElementById("filterFamiliale").addEventListener("click", () => setCategoryFilter("familiale"));
    document.getElementById("filterSemaine").addEventListener("click", () => setCategoryFilter("menu de la semaine"));

    // Stars Selector
    document.querySelectorAll("#starsSelector .star").forEach(star => {
        star.addEventListener("click", () => {
            selectedStars = parseInt(star.dataset.value);
            updateStarsDisplay();
        });
    });

    // Rayon/Article Selectors
    rayonSelect.addEventListener("change", onRayonChange);
    articleSelect.addEventListener("change", () => {
        document.getElementById("btnAddArticle").disabled = !articleSelect.value;
    });

    form.addEventListener("submit", handleFormSubmit);

    // Auth State Listener
    onAuthStateChanged(auth, (user) => {
        const loginContainer = document.getElementById("loginContainer");
        const appContainer = document.getElementById("appContainer");

        if (user) {
            loginContainer.classList.add("hidden");
            appContainer.classList.remove("hidden");
            startSync();
        } else {
            loginContainer.classList.remove("hidden");
            appContainer.classList.add("hidden");
        }
    });
}

let unsubscribeMenus = null;
let unsubscribeShoppingList = null;

function startSync() {
    // Sync Menus
    if (unsubscribeMenus) unsubscribeMenus();
    unsubscribeMenus = onSnapshot(query(menusCollection), (snapshot) => {
        menus = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
        render();
        loadingState.classList.add("hidden");
    }, (error) => {
        console.error("Error fetching menus:", error);
        loadingState.innerHTML = `<div style="color:var(--danger); text-align:center"><p><strong>Erreur de chargement</strong></p><p>${error.message}</p></div>`;
    });

    // Sync Shopping List (for article selector)
    if (unsubscribeShoppingList) unsubscribeShoppingList();
    unsubscribeShoppingList = onSnapshot(query(shoppingListCollection), (snapshot) => {
        shoppingListItems = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
        populateRayonSelect();
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
function render() {
    menusList.innerHTML = "";

    let filteredMenus = menus;
    if (currentCategoryFilter !== "all") {
        filteredMenus = menus.filter(m => m.category === currentCategoryFilter);
    }

    if (filteredMenus.length === 0 && menus.length > 0) {
        menusList.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-secondary)">Aucun menu dans cette catégorie.</div>`;
        emptyState.classList.add("hidden");
        return;
    } else if (menus.length === 0) {
        emptyState.classList.remove("hidden");
        return;
    } else {
        emptyState.classList.add("hidden");
    }

    // Group by category
    const grouped = {};
    filteredMenus.forEach(menu => {
        const cat = menu.category || "rapide";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(menu);
    });

    // Sort categories
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const idxA = CATEGORIES.indexOf(a);
        const idxB = CATEGORIES.indexOf(b);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    sortedCategories.forEach(category => {
        const categoryMenus = grouped[category];

        const details = document.createElement("details");
        details.open = false;

        const summary = document.createElement("summary");
        summary.textContent = `${getCategoryEmoji(category)} ${category} (${categoryMenus.length})`;
        details.appendChild(summary);

        const contentDiv = document.createElement("div");
        contentDiv.className = "details-content menus-grid";

        categoryMenus.forEach(menu => {
            const card = createMenuCard(menu);
            contentDiv.appendChild(card);
        });

        details.appendChild(contentDiv);
        menusList.appendChild(details);
    });
}

function getCategoryEmoji(category) {
    const emojis = {
        "rapide": "🍳",
        "Apéritif": "🥂",
        "gourmet": "🍷",
        "familiale": "👨‍👩‍👧‍👦",
        "menu de la semaine": "📅"
    };
    return emojis[category] || "🍽️";
}

function createMenuCard(menu) {
    const card = document.createElement("div");
    card.className = "menu-card";

    const stars = menu.stars || 1;
    const starsHtml = Array(5).fill(0).map((_, i) =>
        `<span class="star-icon ${i < stars ? 'filled' : ''}">${i < stars ? '★' : '☆'}</span>`
    ).join("");

    const itemsPreview = (menu.items || []).slice(0, 3).join(", ");
    const moreItems = (menu.items || []).length > 3 ? ` +${menu.items.length - 3}` : "";

    const isInWeekMenu = menu.category === "menu de la semaine";

    card.innerHTML = `
        <div class="menu-card-header">
            <h3>${escapeHtml(menu.title)}</h3>
            <div class="menu-stars">${starsHtml}</div>
        </div>
        <div class="menu-card-items">
            <span class="material-symbols-rounded" style="font-size: 16px; opacity: 0.6">grocery</span>
            ${itemsPreview ? escapeHtml(itemsPreview) + moreItems : '<em>Aucun article</em>'}
        </div>
        <div class="menu-card-actions">
            ${isInWeekMenu
            ? `<button class="btn-icon btn-restore" title="Restaurer dans catégorie d'origine" onclick="window.restoreMenu('${menu.id}')">
                       <span class="material-symbols-rounded">restore</span>
                   </button>`
            : `<button class="btn-icon btn-cart" title="Ajouter au panier" onclick="window.openAddToCartModal('${menu.id}')">
                       <span class="material-symbols-rounded">add_shopping_cart</span>
                   </button>`
        }
            <button class="btn-icon" title="Modifier" onclick="window.editMenu('${menu.id}')">
                <span class="material-symbols-rounded">edit</span>
            </button>
            <button class="btn-icon" style="color:var(--danger)" title="Supprimer" onclick="window.deleteMenu('${menu.id}')">
                <span class="material-symbols-rounded">delete</span>
            </button>
        </div>
    `;

    return card;
}

function setCategoryFilter(category) {
    currentCategoryFilter = category;

    // Update active tab
    document.getElementById("filterAll").classList.toggle("active", category === "all");
    document.getElementById("filterRapide").classList.toggle("active", category === "rapide");
    document.getElementById("filterAperitif").classList.toggle("active", category === "Apéritif");
    document.getElementById("filterGourmet").classList.toggle("active", category === "gourmet");
    document.getElementById("filterFamiliale").classList.toggle("active", category === "familiale");
    document.getElementById("filterSemaine").classList.toggle("active", category === "menu de la semaine");

    render();
}

// --- Modal ---
function openModal(menu = null) {
    modal.classList.remove("hidden");
    editingMenuId = menu ? menu.id : null;
    selectedMenuItems = menu ? [...(menu.items || [])] : [];

    if (menu) {
        document.getElementById("modalTitle").textContent = "Modifier le Menu";
        document.getElementById("menuId").value = menu.id;
        document.getElementById("menuTitle").value = menu.title;
        document.getElementById("menuCategory").value = menu.category || "rapide";
        selectedStars = menu.stars || 1;
    } else {
        document.getElementById("modalTitle").textContent = "Nouveau Menu";
        form.reset();
        document.getElementById("menuId").value = "";
        selectedStars = 1;
    }

    updateStarsDisplay();
    renderSelectedArticles();
    populateRayonSelect();
}

function closeModal() {
    modal.classList.add("hidden");
    editingMenuId = null;
    selectedMenuItems = [];
}

function updateStarsDisplay() {
    document.getElementById("menuStars").value = selectedStars;
    document.querySelectorAll("#starsSelector .star").forEach(star => {
        const val = parseInt(star.dataset.value);
        star.textContent = val <= selectedStars ? "★" : "☆";
        star.classList.toggle("filled", val <= selectedStars);
    });
}

function populateRayonSelect() {
    const rayons = [...new Set(shoppingListItems.map(i => i.rayon || "Divers"))].sort();
    rayonSelect.innerHTML = '<option value="">-- Sélectionner un rayon --</option>';
    rayons.forEach(rayon => {
        const opt = document.createElement("option");
        opt.value = rayon;
        opt.textContent = rayon;
        rayonSelect.appendChild(opt);
    });
}

function onRayonChange() {
    const selectedRayon = rayonSelect.value;
    articleSelect.innerHTML = '<option value="">-- Sélectionner un article --</option>';
    articleSelect.disabled = !selectedRayon;
    document.getElementById("btnAddArticle").disabled = true;

    if (selectedRayon) {
        const articles = shoppingListItems
            .filter(i => (i.rayon || "Divers") === selectedRayon)
            .map(i => i.item)
            .sort();

        articles.forEach(article => {
            const opt = document.createElement("option");
            opt.value = article;
            opt.textContent = article;
            articleSelect.appendChild(opt);
        });
    }
}

function addArticleToMenu() {
    const article = articleSelect.value;
    if (article && !selectedMenuItems.includes(article)) {
        selectedMenuItems.push(article);
        renderSelectedArticles();
    }
    articleSelect.value = "";
    document.getElementById("btnAddArticle").disabled = true;
}

function renderSelectedArticles() {
    selectedArticlesContainer.innerHTML = "";
    selectedMenuItems.forEach(article => {
        const chip = document.createElement("span");
        chip.className = "article-chip";
        chip.innerHTML = `${escapeHtml(article)} <button type="button" onclick="window.removeArticleFromMenu('${escapeHtml(article)}')">&times;</button>`;
        selectedArticlesContainer.appendChild(chip);
    });
}

window.removeArticleFromMenu = (article) => {
    selectedMenuItems = selectedMenuItems.filter(a => a !== article);
    renderSelectedArticles();
};

async function handleFormSubmit(e) {
    e.preventDefault();

    const data = {
        title: document.getElementById("menuTitle").value,
        category: document.getElementById("menuCategory").value,
        stars: selectedStars,
        items: selectedMenuItems
    };

    try {
        if (editingMenuId) {
            await updateDoc(doc(db, "menus", editingMenuId), data);
        } else {
            await addDoc(menusCollection, data);
        }
        closeModal();
    } catch (err) {
        console.error(err);
        alert("Erreur lors de l'enregistrement.");
    }
}

// --- Actions ---
window.editMenu = (id) => {
    const menu = menus.find(m => m.id === id);
    if (menu) openModal(menu);
};

window.deleteMenu = async (id) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce menu ?")) {
        try {
            await deleteDoc(doc(db, "menus", id));
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la suppression.");
        }
    }
};

window.restoreMenu = async (id) => {
    const menu = menus.find(m => m.id === id);
    if (!menu) return;

    const originalCategory = menu.originalCategory || "rapide";
    try {
        await updateDoc(doc(db, "menus", id), {
            category: originalCategory,
            originalCategory: null
        });
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la restauration.");
    }
};

// --- Add to Cart ---
window.openAddToCartModal = (id) => {
    const menu = menus.find(m => m.id === id);
    if (!menu) return;

    addToCartMenuDoc = menu;
    const items = menu.items || [];

    document.getElementById("addToCartTitle").textContent = `Ajouter au panier: ${menu.title}`;

    const container = document.getElementById("addToCartItems");
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">Ce menu n\'a pas d\'articles.</p>';
    } else {
        items.forEach((item, idx) => {
            const label = document.createElement("label");
            label.className = "checkbox-item";
            label.innerHTML = `
                <input type="checkbox" name="cartItem" value="${escapeHtml(item)}" checked>
                <span>${escapeHtml(item)}</span>
            `;
            container.appendChild(label);
        });
    }

    addToCartModal.classList.remove("hidden");
};

function closeAddToCartModal() {
    addToCartModal.classList.add("hidden");
    addToCartMenuDoc = null;
}

async function confirmAddToCart() {
    if (!addToCartMenuDoc) return;

    const checkboxes = document.querySelectorAll('#addToCartItems input[name="cartItem"]:checked');
    const selectedItems = Array.from(checkboxes).map(cb => cb.value);

    if (selectedItems.length === 0) {
        alert("Aucun article sélectionné.");
        return;
    }

    try {
        // Add each item to shopping_list (or update if exists)
        for (const itemName of selectedItems) {
            const existingItem = shoppingListItems.find(i => i.item === itemName);
            if (existingItem) {
                await updateDoc(doc(db, "shopping_list", existingItem.id), { isInCourses: true });
            } else {
                // If item doesn't exist in shopping_list, create it
                await addDoc(shoppingListCollection, {
                    item: itemName,
                    rayon: "Divers",
                    isChecked: false,
                    isInCourses: true
                });
            }
        }

        // Move menu to "menu de la semaine"
        if (addToCartMenuDoc.category !== "menu de la semaine") {
            await updateDoc(doc(db, "menus", addToCartMenuDoc.id), {
                originalCategory: addToCartMenuDoc.category,
                category: "menu de la semaine"
            });
        }

        closeAddToCartModal();
        alert(`${selectedItems.length} article(s) ajouté(s) au panier !`);
    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'ajout au panier.");
    }
}

async function resetMenus() {
    const weekMenus = menus.filter(m => m.category === "menu de la semaine");

    if (weekMenus.length === 0) {
        alert("Aucun menu à réinitialiser.");
        return;
    }

    if (!confirm(`Réinitialiser ${weekMenus.length} menu(s) dans leur catégorie d'origine ?`)) {
        return;
    }

    try {
        for (const menu of weekMenus) {
            const originalCategory = menu.originalCategory || "rapide";
            await updateDoc(doc(db, "menus", menu.id), {
                category: originalCategory,
                originalCategory: null
            });
        }
        alert("Menus réinitialisés !");
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la réinitialisation.");
    }
}

// --- Helpers ---
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
