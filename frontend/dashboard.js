let transactions = JSON.parse(localStorage.getItem("transactions")) || [];

const amountInput = document.getElementById("amount");
const typeInput = document.getElementById("type");
const categoryInput = document.getElementById("category");
const descriptionInput = document.getElementById("description");
const message = document.getElementById("transactionMessage");

document.getElementById("addTransaction").addEventListener("click", addTransaction);

function addTransaction() {
    const amount = Number(amountInput.value);
    const type = typeInput.value;
    const category = categoryInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!amount || amount <= 0) {
        message.textContent = "Please enter a valid amount.";
        return;
    }

    if (!category) {
        message.textContent = "Please enter a category.";
        return;
    }

    const transaction = {
        id: Date.now(),
        amount: amount,
        type: type,
        category: category,
        description: description
    };

    transactions.push(transaction);

    localStorage.setItem("transactions", JSON.stringify(transactions));

    amountInput.value = "";
    categoryInput.value = "";
    descriptionInput.value = "";

    message.textContent =
        document.getElementById("addTransaction").textContent === "Save Changes"
            ? "Transaction updated successfully!"
            : "Transaction added successfully!";

    document.getElementById("addTransaction").textContent = "Add Transaction";

    updateDashboard();
}

function updateDashboard() {
    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach(transaction => {
        if (transaction.type === "income") {
            totalIncome += transaction.amount;
        } else {
            totalExpenses += transaction.amount;
        }
    });

    const balance = totalIncome - totalExpenses;

    document.getElementById("income").textContent =
        "₦" + totalIncome.toLocaleString();

    document.getElementById("expenses").textContent =
        "₦" + totalExpenses.toLocaleString();

    document.getElementById("balance").textContent =
        "₦" + balance.toLocaleString();

    displayTransactions();
}

function displayTransactions() {
    const transactionList = document.getElementById("transactionList");

    if (transactions.length === 0) {
        transactionList.innerHTML = "<p>No transactions yet.</p>";
        return;
    }

    transactionList.innerHTML = "";

    transactions.slice().reverse().forEach(transaction => {
        const item = document.createElement("div");
        item.className = "transaction-item";

        const sign = transaction.type === "income" ? "+" : "-";

        item.innerHTML = `
            <div>
                <strong>${transaction.category}</strong>
                <p>${transaction.description || "No description"}</p>
            </div>

            <div class="transaction-actions">
                <strong>
                    ${sign}₦${transaction.amount.toLocaleString()}
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
    const transaction = transactions.find(transaction => transaction.id === id);

    if (!transaction) {
        return;
    }

    amountInput.value = transaction.amount;
    typeInput.value = transaction.type;
    categoryInput.value = transaction.category;
    descriptionInput.value = transaction.description || "";

    // Remove the old transaction.
    // Clicking Add Transaction will save the edited version.
    transactions = transactions.filter(transaction => transaction.id !== id);

    localStorage.setItem("transactions", JSON.stringify(transactions));

    document.getElementById("addTransaction").textContent = "Save Changes";

    message.textContent = "Edit the transaction and click Save Changes.";

    updateDashboard();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function deleteTransaction(id) {
    transactions = transactions.filter(transaction => transaction.id !== id);

    localStorage.setItem("transactions", JSON.stringify(transactions));

    updateDashboard();
}

updateDashboard();

// Logout
document.querySelector(".logout-btn").addEventListener("click", function () {
    localStorage.removeItem("token");
    window.location.href = "index.html";
});


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
