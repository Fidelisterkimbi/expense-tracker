// ==========================================
// TRANSACTIONS - FLASK / POSTGRESQL
// ==========================================

let transactions = [];
let editingTransactionId = null;

const titleInput = document.getElementById("title");
const amountInput = document.getElementById("amount");
const typeInput = document.getElementById("type");
const categoryInput = document.getElementById("category");
const dateInput = document.getElementById("transactionDate");
const descriptionInput = document.getElementById("description");
const message = document.getElementById("transactionMessage");
const addTransactionButton = document.getElementById("addTransaction");

if (addTransactionButton) {
    addTransactionButton.addEventListener("click", saveTransaction);
}


function getToken() {
    return localStorage.getItem("token");
}


function handleUnauthorized(response) {
    if (response.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "index.html";
        return true;
    }

    return false;
}


async function saveTransaction() {
    const token = getToken();

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const title = titleInput.value.trim();
    const amount = Number(amountInput.value);
    const type = typeInput.value;
    const category = categoryInput.value.trim();
    const transactionDate = dateInput.value;
    const description = descriptionInput.value.trim();

    if (!title) {
        message.textContent = "Please enter a transaction title.";
        return;
    }

    if (!amount || amount <= 0) {
        message.textContent = "Please enter a valid amount.";
        return;
    }

    if (!category) {
        message.textContent = "Please enter a category.";
        return;
    }

    const payload = {
        title: title,
        amount: amount,
        type: type,
        category: category,
        description: description
    };

    if (transactionDate) {
        payload.date = transactionDate;
    }

    const isEditing = editingTransactionId !== null;

    const url = isEditing
        ? `/api/expenses/${editingTransactionId}`
        : "/api/expenses";

    const method = isEditing ? "PUT" : "POST";

    addTransactionButton.disabled = true;

    message.textContent = isEditing
        ? "Saving changes..."
        : "Adding transaction...";

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (handleUnauthorized(response)) {
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            message.textContent =
                data.error ||
                data.message ||
                data.msg ||
                "Could not save transaction.";

            return;
        }

        message.textContent = isEditing
            ? "Transaction updated successfully!"
            : "Transaction added successfully!";

        clearTransactionForm();

        await loadTransactions();

    } catch (error) {
        console.error("Transaction save error:", error);

        message.textContent =
            "Could not connect to the server.";

    } finally {
        addTransactionButton.disabled = false;
    }
}


async function loadTransactions() {
    const token = getToken();

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    try {
        const response = await fetch("/api/expenses", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (handleUnauthorized(response)) {
            return;
        }

        if (!response.ok) {
            throw new Error("Could not load transactions");
        }

        transactions = await response.json();

        transactions.sort((a, b) => {
            const dateCompare =
                new Date(b.date) - new Date(a.date);

            if (dateCompare !== 0) {
                return dateCompare;
            }

            return Number(b.id) - Number(a.id);
        });

        updateDashboard();

    } catch (error) {
        console.error("Load transactions error:", error);

        const transactionList =
            document.getElementById("transactionList");

        if (transactionList) {
            transactionList.innerHTML =
                "<p>Could not load transactions.</p>";
        }
    }
}


function updateDashboard() {
    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach(transaction => {
        const amount = Number(transaction.amount) || 0;

        if (transaction.type === "income") {
            totalIncome += amount;
        } else if (transaction.type === "expense") {
            totalExpenses += amount;
        }
    });

    const balance = totalIncome - totalExpenses;

    document.getElementById("income").textContent =
        "₦" + totalIncome.toLocaleString();

    document.getElementById("expenses").textContent =
        "₦" + totalExpenses.toLocaleString();

    document.getElementById("balance").textContent =
        "₦" + balance.toLocaleString();

    if (typeof refreshTransactionFilters === "function") {
        refreshTransactionFilters();
    } else {
        displayTransactions();
    }
}


function displayTransactions() {
    const transactionList =
        document.getElementById("transactionList");

    if (!transactionList) {
        return;
    }

    if (transactions.length === 0) {
        transactionList.innerHTML =
            "<p>No transactions yet.</p>";

        return;
    }

    transactionList.innerHTML = "";

    transactions.forEach(transaction => {
        const item = document.createElement("div");
        item.className = "transaction-item";

        const sign =
            transaction.type === "income" ? "+" : "-";

        const amount =
            Number(transaction.amount || 0).toLocaleString();

        const title = escapeHtml(
            transaction.title || transaction.category
        );

        const category =
            escapeHtml(transaction.category || "");

        const description =
            escapeHtml(
                transaction.description || "No description"
            );

        const transactionDate =
            escapeHtml(transaction.date || "");

        item.innerHTML = `
            <div>
                <strong>${title}</strong>

                <p>
                    ${category}
                    ${transactionDate ? " • " + transactionDate : ""}
                </p>

                <p>${description}</p>
            </div>

            <div class="transaction-actions">
                <strong>
                    ${sign}₦${amount}
                </strong>

                <button
                    class="edit-btn"
                    onclick="editTransaction(${transaction.id})">
                    Edit
                </button>

                <button
                    class="delete-btn"
                    onclick="deleteTransaction(${transaction.id})">
                    Delete
                </button>
            </div>
        `;

        transactionList.appendChild(item);
    });
}


function editTransaction(id) {
    const transaction =
        transactions.find(
            transaction => Number(transaction.id) === Number(id)
        );

    if (!transaction) {
        return;
    }

    editingTransactionId = transaction.id;

    titleInput.value = transaction.title || "";
    amountInput.value = transaction.amount;
    typeInput.value = transaction.type;
    categoryInput.value = transaction.category;
    dateInput.value = transaction.date || "";
    descriptionInput.value = transaction.description || "";

    addTransactionButton.textContent = "Save Changes";

    message.textContent =
        "Edit the transaction and click Save Changes.";

    document.querySelector(".transaction-form")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}


async function deleteTransaction(id) {
    const token = getToken();

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const confirmed =
        window.confirm(
            "Are you sure you want to delete this transaction?"
        );

    if (!confirmed) {
        return;
    }

    try {
        const response =
            await fetch(`/api/expenses/${id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

        if (handleUnauthorized(response)) {
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            message.textContent =
                data.error ||
                data.message ||
                "Could not delete transaction.";

            return;
        }

        if (
            Number(editingTransactionId) === Number(id)
        ) {
            clearTransactionForm();
        }

        message.textContent =
            "Transaction deleted successfully!";

        await loadTransactions();

    } catch (error) {
        console.error("Delete transaction error:", error);

        message.textContent =
            "Could not connect to the server.";
    }
}


function clearTransactionForm() {
    editingTransactionId = null;

    titleInput.value = "";
    amountInput.value = "";
    typeInput.value = "income";
    categoryInput.value = "";
    dateInput.value = "";
    descriptionInput.value = "";

    addTransactionButton.textContent =
        "Add Transaction";
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// Logout
document.querySelector(".logout-btn")
    .addEventListener("click", function () {
        localStorage.removeItem("token");
        window.location.href = "index.html";
    });


// Load transactions from PostgreSQL
loadTransactions();


// ========================================
// SAVINGS PAYMENT SESSION
// ========================================

// ==========================================
// RECORD SAVING
// ==========================================

const recordSavingButton = document.getElementById("recordSaving");

if (recordSavingButton) {
    recordSavingButton.addEventListener("click", recordSaving);
}

async function recordSaving() {
    const token = localStorage.getItem("token");

    const amountInput =
        document.getElementById("savingDepositAmount");

    const dateInput =
        document.getElementById("savingDepositDate");

    const message =
        document.getElementById("savingDepositMessage");

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const amount = Number(amountInput.value);
    const savingDate = dateInput.value;

    if (!amount || amount <= 0) {
        message.textContent =
            "Please enter a valid saving amount.";
        return;
    }

    recordSavingButton.disabled = true;
    message.textContent = "Recording saving...";

    try {
        const response = await fetch("/api/savings/deposit", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: amount,
                saving_date: savingDate || null
            })
        });

        const data = await response.json();

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "index.html";
            return;
        }

        if (!response.ok) {
            message.textContent =
                data.error ||
                data.message ||
                "Could not record saving.";

            return;
        }

        message.textContent =
            "Saving recorded successfully!";

        amountInput.value = "";
        dateInput.value = "";

        await loadSavingsGoal();
        await loadSavingsHistory();

    } catch (error) {
        console.error("Record saving error:", error);

        message.textContent =
            "Could not connect to the server.";
    } finally {
        recordSavingButton.disabled = false;
    }
}


async function loadSavingsHistory() {
    const token = localStorage.getItem("token");
    const history = document.getElementById("savingsHistory");

    if (!token || !history) {
        return;
    }

    try {
        const response = await fetch("/api/savings", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "index.html";
            return;
        }

        if (!response.ok) {
            history.innerHTML = "<p>Could not load savings history.</p>";
            return;
        }

        const data = await response.json();
        const deposits = data.deposits || [];

        if (deposits.length === 0) {
            history.innerHTML = "<p>No savings yet.</p>";
            return;
        }

        history.innerHTML = deposits.map(deposit => {
            const amount = Number(deposit.amount || 0)
                .toLocaleString();

            const date = deposit.saving_date || "";

            return `
                <div class="saving-history-item">
                    <strong>₦${amount}</strong>
                    <span>${date}</span>
                    <span>Successful</span>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Savings history error:", error);

        history.innerHTML =
            "<p>Could not load savings history.</p>";
    }
}


// ==========================================
// SAVINGS GOAL
// ==========================================

const saveGoalButton = document.getElementById("saveGoal");

if (saveGoalButton) {
    saveGoalButton.addEventListener("click", saveSavingsGoal);
}

async function saveSavingsGoal() {
    const token = localStorage.getItem("token");

    const nameInput = document.getElementById("savingGoalName");
    const amountInput = document.getElementById("savingGoalAmount");
    const message = document.getElementById("savingGoalMessage");

    const name = nameInput.value.trim();
    const targetAmount = Number(amountInput.value);

    if (!token) {
        message.textContent = "Please log in again.";
        return;
    }

    if (!name) {
        message.textContent = "Please enter a goal name.";
        return;
    }

    if (!targetAmount || targetAmount <= 0) {
        message.textContent = "Please enter a valid target amount.";
        return;
    }

    message.textContent = "Saving goal...";

    try {
        const response = await fetch("/api/savings/goal", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },

            body: JSON.stringify({
                name: name,
                target_amount: targetAmount
            })
        });

        const data = await response.json();

        if (!response.ok) {
            message.textContent =
                data.error ||
                data.message ||
                data.msg ||
                "Could not save savings goal.";

            return;
        }

        message.textContent = "Savings goal saved successfully!";

        nameInput.value = "";
        amountInput.value = "";

        await loadSavingsGoal();

    } catch (error) {
        console.error("Savings goal error:", error);

        message.textContent =
            "Could not connect to the server.";
    }
}


async function loadSavingsGoal() {
    const token = localStorage.getItem("token");

    if (!token) {
        return;
    }

    try {
        const response = await fetch("/api/savings/goal", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        const goal = data.goal || data;

        const target =
            Number(
                goal.target_amount ??
                goal.target ??
                0
            );

        const saved =
            Number(
                goal.amount_saved ??
                goal.saved_amount ??
                goal.total_saved ??
                0
            );

        const remaining = Math.max(target - saved, 0);

        const percentage =
            target > 0
                ? Math.min((saved / target) * 100, 100)
                : 0;

        document.getElementById("savingTarget").textContent =
            "₦" + target.toLocaleString();

        document.getElementById("amountSaved").textContent =
            "₦" + saved.toLocaleString();

        document.getElementById("savingRemaining").textContent =
            "₦" + remaining.toLocaleString();

        document.getElementById("savingProgress").textContent =
            percentage.toFixed(1) + "%";

        document.getElementById("savingProgressBar").style.width =
            percentage + "%";

    } catch (error) {
        console.error("Could not load savings goal:", error);
    }
}


// Load savings information when dashboard opens
loadSavingsGoal();
loadSavingsHistory();


// ==========================================
// TRANSACTION SEARCH & FILTERS
// ==========================================

const transactionSearch =
    document.getElementById("transactionSearch");

const transactionTypeFilter =
    document.getElementById("transactionTypeFilter");

const transactionCategoryFilter =
    document.getElementById("transactionCategoryFilter");

const transactionDateFilter =
    document.getElementById("transactionDateFilter");

const transactionCount =
    document.getElementById("transactionCount");


function populateCategoryFilter() {
    if (!transactionCategoryFilter) return;

    const currentValue = transactionCategoryFilter.value;

    const categories = [
        ...new Set(
            transactions
                .map(transaction => transaction.category)
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    transactionCategoryFilter.innerHTML =
        '<option value="all">All Categories</option>';

    categories.forEach(category => {
        const option = document.createElement("option");

        option.value = category;
        option.textContent = category;

        transactionCategoryFilter.appendChild(option);
    });

    if (categories.includes(currentValue)) {
        transactionCategoryFilter.value = currentValue;
    }
}


function getFilteredTransactions() {
    const search =
        transactionSearch?.value.trim().toLowerCase() || "";

    const selectedType =
        transactionTypeFilter?.value || "all";

    const selectedCategory =
        transactionCategoryFilter?.value || "all";

    const selectedDate =
        transactionDateFilter?.value || "";

    return transactions.filter(transaction => {

        const title =
            String(transaction.title || "").toLowerCase();

        const category =
            String(transaction.category || "").toLowerCase();

        const description =
            String(transaction.description || "").toLowerCase();

        const matchesSearch =
            !search ||
            title.includes(search) ||
            category.includes(search) ||
            description.includes(search);

        const matchesType =
            selectedType === "all" ||
            transaction.type === selectedType;

        const matchesCategory =
            selectedCategory === "all" ||
            transaction.category === selectedCategory;

        const matchesDate =
            !selectedDate ||
            transaction.date === selectedDate;

        return (
            matchesSearch &&
            matchesType &&
            matchesCategory &&
            matchesDate
        );
    });
}


function displayFilteredTransactions() {
    const transactionList =
        document.getElementById("transactionList");

    if (!transactionList) return;

    const filteredTransactions =
        getFilteredTransactions();

    if (transactionCount) {
        transactionCount.textContent =
            `${filteredTransactions.length} of ${transactions.length} transactions`;
    }

    if (filteredTransactions.length === 0) {
        transactionList.innerHTML =
            "<p>No transactions match your filters.</p>";
        return;
    }

    transactionList.innerHTML = "";

    filteredTransactions.forEach(transaction => {
        const item = document.createElement("div");

        item.className = "transaction-item";

        const sign =
            transaction.type === "income" ? "+" : "-";

        const amount =
            Number(transaction.amount || 0).toLocaleString();

        const title =
            escapeHtml(transaction.title || transaction.category);

        const category =
            escapeHtml(transaction.category || "");

        const description =
            escapeHtml(transaction.description || "No description");

        const transactionDate =
            escapeHtml(transaction.date || "");

        item.innerHTML = `
            <div>
                <strong>${title}</strong>

                <p>
                    ${category}
                    ${transactionDate ? " • " + transactionDate : ""}
                </p>

                <p>${description}</p>
            </div>

            <div class="transaction-actions">
                <strong>${sign}₦${amount}</strong>

                <button
                    class="edit-btn"
                    onclick="editTransaction(${transaction.id})">
                    Edit
                </button>

                <button
                    class="delete-btn"
                    onclick="deleteTransaction(${transaction.id})">
                    Delete
                </button>
            </div>
        `;

        transactionList.appendChild(item);
    });
}


function refreshTransactionFilters() {
    populateCategoryFilter();
    displayFilteredTransactions();
}


[
    transactionSearch,
    transactionTypeFilter,
    transactionCategoryFilter,
    transactionDateFilter
].forEach(control => {

    if (!control) return;

    const eventName =
        control === transactionSearch
            ? "input"
            : "change";

    control.addEventListener(
        eventName,
        displayFilteredTransactions
    );
});
