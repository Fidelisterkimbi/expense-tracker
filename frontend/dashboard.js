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
    const currency = "NGN";
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
        currency: currency,
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
        await loadAccountBalances();

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

        const currency =
            transaction.currency || "NGN";

        const currencySymbol =
            currency === "USD" ? "$" : "₦";

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
                    ${sign}${currencySymbol}${amount}
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

    const savingCurrencyInput =
        document.getElementById("savingCurrency");

    const message =
        document.getElementById("savingDepositMessage");

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const amount = Number(amountInput.value);
    const savingDate = dateInput.value;
    const savingCurrency =
        savingCurrencyInput?.value || "NGN";

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
                currency: savingCurrency,
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
        await loadAccountBalances();
        await loadMonthlyStatistics();

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



// ==========================================
// REAL NGN / USD ACCOUNT BALANCES
// ==========================================

function formatAccountMoney(amount, currency) {
    const value = Number(amount) || 0;

    return new Intl.NumberFormat(
        currency === "USD" ? "en-US" : "en-NG",
        {
            style: "currency",
            currency: currency,
            minimumFractionDigits: currency === "USD" ? 2 : 0,
            maximumFractionDigits: 2
        }
    ).format(value);
}


async function loadAccountBalances() {
    const token = getToken();

    if (!token) {
        return;
    }

    try {
        const response = await fetch("/api/savings/accounts", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (handleUnauthorized(response)) {
            return;
        }

        if (!response.ok) {
            throw new Error("Could not load account balances");
        }

        const accounts = await response.json();

        const ngn = accounts.NGN || {
            balance: 0,
            deposit_count: 0
        };

        const usd = accounts.USD || {
            balance: 0,
            deposit_count: 0
        };

        const nairaBalance =
            document.getElementById("nairaAccountBalance");

        const dollarBalance =
            document.getElementById("dollarAccountBalance");

        if (nairaBalance) {
            nairaBalance.textContent =
                formatAccountMoney(ngn.balance, "NGN");
        }

        if (dollarBalance) {
            dollarBalance.textContent =
                formatAccountMoney(usd.balance, "USD");
        }

    } catch (error) {
        console.error("Account balance error:", error);
    }
}


// ==========================================
// MONTHLY STATISTICS
// ==========================================

const statisticsCurrency =
    document.getElementById("statisticsCurrency");

const statisticsStartMonth =
    document.getElementById("statisticsStartMonth");

const statisticsEndMonth =
    document.getElementById("statisticsEndMonth");


function initialiseStatisticsRange() {
    if (!statisticsStartMonth || !statisticsEndMonth) {
        return;
    }

    const now = new Date();

    const endYear = now.getFullYear();
    const endMonth = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const start = new Date(
        endYear,
        now.getMonth() - 5,
        1
    );

    const startYear = start.getFullYear();
    const startMonth = String(
        start.getMonth() + 1
    ).padStart(2, "0");

    statisticsStartMonth.value =
        `${startYear}-${startMonth}`;

    statisticsEndMonth.value =
        `${endYear}-${endMonth}`;
}


function getStatisticsSymbol(currency) {
    return currency === "USD" ? "$" : "₦";
}


function formatStatisticsAmount(amount, currency) {
    return (
        getStatisticsSymbol(currency) +
        Number(amount || 0).toLocaleString(
            currency === "USD" ? "en-US" : "en-NG",
            {
                minimumFractionDigits:
                    currency === "USD" ? 2 : 0,

                maximumFractionDigits: 2
            }
        )
    );
}


async function loadMonthlyStatistics() {
    const token = getToken();

    if (
        !token ||
        !statisticsCurrency ||
        !statisticsStartMonth ||
        !statisticsEndMonth
    ) {
        return;
    }

    if (
        !statisticsStartMonth.value ||
        !statisticsEndMonth.value
    ) {
        return;
    }

    const [startYear, startMonth] =
        statisticsStartMonth.value
            .split("-")
            .map(Number);

    const [endYear, endMonth] =
        statisticsEndMonth.value
            .split("-")
            .map(Number);

    if (
        startYear > endYear ||
        (
            startYear === endYear &&
            startMonth > endMonth
        )
    ) {
        return;
    }

    const currency =
        statisticsCurrency.value;

    const params = new URLSearchParams({
        currency: currency,
        start_year: startYear,
        start_month: startMonth,
        end_year: endYear,
        end_month: endMonth
    });

    try {
        const response = await fetch(
            `/api/savings/statistics/monthly?${params.toString()}`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        if (handleUnauthorized(response)) {
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Could not load monthly statistics"
            );
        }

        renderMonthlyStatistics(data);

    } catch (error) {
        console.error(
            "Monthly statistics error:",
            error
        );
    }
}


function renderMonthlyStatistics(data) {
    const currency = data.currency || "NGN";

    const saved =
        document.getElementById("statisticsSaved");

    const depositCount =
        document.getElementById("statisticsDepositCount");

    if (saved) {
        saved.textContent =
            formatStatisticsAmount(
                data.summary?.saved,
                currency
            );
    }

    if (depositCount) {
        depositCount.textContent =
            Number(
                data.summary?.deposit_count || 0
            ).toLocaleString();
    }

    const chart =
        document.getElementById("monthlyChart");

    if (!chart) {
        return;
    }

    const months = data.months || [];

    if (!months.length) {
        chart.innerHTML =
            '<p class="empty-chart">No savings for this range.</p>';

        return;
    }

    const largestValue = Math.max(
        1,
        ...months.map(
            month => Number(month.saved) || 0
        )
    );

    chart.innerHTML = "";

    months.forEach(month => {
        const column =
            document.createElement("div");

        column.className =
            "monthly-chart-column";

        const bars =
            document.createElement("div");

        bars.className =
            "monthly-chart-bars";

        const savingsBar =
            document.createElement("div");

        savingsBar.className =
            "monthly-bar monthly-income-bar";

        const savedAmount =
            Number(month.saved) || 0;

        savingsBar.style.height =
            `${Math.max(
                savedAmount
                    ? (savedAmount / largestValue) * 100
                    : 0,
                savedAmount ? 3 : 0
            )}%`;

        savingsBar.title =
            `Saved: ${formatStatisticsAmount(
                savedAmount,
                currency
            )}`;

        bars.appendChild(savingsBar);

        const label =
            document.createElement("span");

        label.textContent = month.label;

        column.appendChild(bars);
        column.appendChild(label);

        chart.appendChild(column);
    });
}


[
    statisticsCurrency,
    statisticsStartMonth,
    statisticsEndMonth
].forEach(control => {
    if (control) {
        control.addEventListener(
            "change",
            loadMonthlyStatistics
        );
    }
});


initialiseStatisticsRange();
loadMonthlyStatistics();


// ==========================================
// USER PROFILE PICTURE
// ==========================================

const profileAvatar =
    document.getElementById("profileAvatar");

const profileImage =
    document.getElementById("profileImage");

const profileInitials =
    document.getElementById("profileInitials");

const profileUsername =
    document.getElementById("profileUsername");

const profilePictureInput =
    document.getElementById("profilePictureInput");


function createProfileInitials(username) {
    const words = String(username || "User")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) {
        return "U";
    }

    if (words.length === 1) {
        return words[0]
            .slice(0, 2)
            .toUpperCase();
    }

    return (
        words[0][0] +
        words[words.length - 1][0]
    ).toUpperCase();
}


function displayProfilePicture(url) {
    if (!profileImage || !profileInitials) {
        return;
    }

    if (url) {
        profileImage.src = `/api${url}`;
        profileImage.hidden = false;
        profileInitials.hidden = true;
    } else {
        profileImage.removeAttribute("src");
        profileImage.hidden = true;
        profileInitials.hidden = false;
    }
}


async function loadUserProfile() {
    const token = localStorage.getItem("token");

    if (!token) {
        return;
    }

    try {
        const response = await fetch("/api/profile", {
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
            throw new Error("Could not load profile");
        }

        const profile = await response.json();

        if (profileUsername) {
            profileUsername.textContent =
                profile.username || "My Account";
        }

        if (profileInitials) {
            profileInitials.textContent =
                createProfileInitials(
                    profile.username
                );
        }

        displayProfilePicture(
            profile.profile_picture
        );

    } catch (error) {
        console.error(
            "Profile loading error:",
            error
        );
    }
}


async function uploadProfilePicture(file) {
    const token = localStorage.getItem("token");

    if (!token || !file) {
        return;
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        alert(
            "Please choose a JPG, PNG or WEBP image."
        );
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert(
            "Profile picture must be 5 MB or smaller."
        );
        return;
    }

    const formData = new FormData();
    formData.append("picture", file);

    if (profileAvatar) {
        profileAvatar.classList.add("uploading");
    }

    try {
        const response = await fetch(
            "/api/profile/picture",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            }
        );

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "index.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Could not upload profile picture."
            );
            return;
        }

        displayProfilePicture(
            data.profile_picture
        );

    } catch (error) {
        console.error(
            "Profile picture upload error:",
            error
        );

        alert(
            "Could not upload profile picture."
        );

    } finally {
        if (profileAvatar) {
            profileAvatar.classList.remove(
                "uploading"
            );
        }

        if (profilePictureInput) {
            profilePictureInput.value = "";
        }
    }
}


if (profileAvatar && profilePictureInput) {
    profileAvatar.addEventListener(
        "click",
        () => profilePictureInput.click()
    );

    profilePictureInput.addEventListener(
        "change",
        () => {
            const file =
                profilePictureInput.files?.[0];

            if (file) {
                uploadProfilePicture(file);
            }
        }
    );
}


loadUserProfile();
