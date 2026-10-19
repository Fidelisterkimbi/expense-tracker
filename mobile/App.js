import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import { createApi, positive, savingsTotals, validDate } from "./src/api";

const BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const money = (n, c) =>
  `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function Button({ title, onPress, disabled, secondary }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#174c44" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({ label, value, onChangeText, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        style={s.input}
        placeholderTextColor="#667875"
        {...props}
      />
    </View>
  );
}
function Choices({ items, value, onChange }) {
  return (
    <View style={s.row}>
      {items.map((item) => (
        <Button
          key={item}
          title={item}
          secondary={item !== value}
          onPress={() => onChange(item)}
        />
      ))}
    </View>
  );
}
const blank = () => ({
  title: "",
  amount: "",
  category: "",
  description: "",
  date: today(),
  type: "expense",
  currency: "NGN",
});
export default function App() {
  const token = useRef(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const [ready, setReady] = useState(false),
    [signed, setSigned] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("Dashboard"),
    [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [username, setUsername] = useState("");
  const [data, setData] = useState(null),
    [currency, setCurrency] = useState("NGN"),
    [form, setForm] = useState(null),
    [goalName, setGoalName] = useState(""),
    [target, setTarget] = useState(""),
    [deposit, setDeposit] = useState(""),
    [depositDate, setDepositDate] = useState(today());
  async function logout() {
    generation.current++;
    token.current = null;
    setSigned(false);
    setData(null);
    setForm(null);
    setPassword("");
    await SecureStore.deleteItemAsync("expense-token");
  }
  const api = createApi(BASE || "", () => token.current, logout);
  async function action(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const version = generation.current;
    setLoading(true);
    try {
      const [profile, expenses, accounts, savings] = await Promise.all(
        ["/profile", "/expenses", "/accounts/summary", "/savings"].map((path) =>
          api(path),
        ),
      );
      if (version === generation.current && token.current) {
        setData({ profile, expenses, accounts, savings });
        setGoalName(savings.goal?.name || "");
        setTarget(String(savings.goal?.target_amount || ""));
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        token.current = await SecureStore.getItemAsync("expense-token");
        if (token.current) {
          setSigned(true);
          await refresh();
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  async function authenticate() {
    if (!BASE || !/^https?:\/\//.test(BASE))
      throw new Error("Set EXPO_PUBLIC_API_URL before starting the app.");
    if (!email.trim() || !password)
      throw new Error("Enter your email and password.");
    if (register) {
      if (!username.trim() || password.length < 6)
        throw new Error(
          "Enter a username and a password of at least 6 characters.",
        );
      await api("/register", "POST", {
        username: username.trim(),
        email: email.trim(),
        password,
      });
    }
    const result = await api("/login", "POST", {
      email: email.trim(),
      password,
    });
    await SecureStore.setItemAsync("expense-token", result.access_token);
    token.current = result.access_token;
    generation.current++;
    setSigned(true);
    setPassword("");
    await refresh();
  }
  async function saveExpense() {
    if (!form.title.trim() || !form.category.trim())
      throw new Error("Title and category are required.");
    await api(
      form.id ? `/expenses/${form.id}` : "/expenses",
      form.id ? "PUT" : "POST",
      {
        ...form,
        title: form.title.trim(),
        category: form.category.trim(),
        amount: positive(form.amount),
        date: validDate(form.date),
      },
    );
    setForm(null);
    await refresh();
  }
  async function upload() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Allow photo library access to choose a profile picture.",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize > 5 * 1024 * 1024)
      throw new Error("Choose a photo smaller than 5 MB.");
    const body = new FormData();
    body.append("picture", {
      uri: asset.uri,
      name: asset.fileName || "profile.jpg",
      type: asset.mimeType || "image/jpeg",
    });
    await api("/profile/picture", "POST", body);
    await refresh();
  }
  const totals = data
    ? savingsTotals(data.savings.deposits)
    : { NGN: 0, USD: 0 };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Text style={s.brand}>EXPENSE TRACKER</Text>
            <Text style={s.heading}>
              {signed ? tab : "Your money, in view."}
            </Text>
            <Text style={s.muted}>
              {signed
                ? "Make room for what matters."
                : "Track spending. Build better habits."}
            </Text>
          </View>
          {!ready ? (
            <ActivityIndicator size="large" />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.content}
              refreshControl={
                signed ? (
                  <RefreshControl
                    refreshing={loading}
                    onRefresh={() => action(refresh)}
                  />
                ) : undefined
              }
            >
              {!!error && (
                <View accessibilityRole="alert" style={s.error}>
                  <Text>{error}</Text>
                </View>
              )}
              {!BASE && (
                <Text style={s.error}>
                  Configure EXPO_PUBLIC_API_URL to connect to your Flask server.
                </Text>
              )}
              {!signed ? (
                <View style={s.card}>
                  <Text style={s.title}>
                    {register ? "Create account" : "Welcome back"}
                  </Text>
                  {register && (
                    <Field
                      label="Username"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                    />
                  )}
                  <Field
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                  <Field
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                  />
                  <Button
                    title={
                      busy
                        ? "Please wait…"
                        : register
                          ? "Create account"
                          : "Sign in"
                    }
                    disabled={busy || !BASE}
                    onPress={() => action(authenticate)}
                  />
                  <Button
                    secondary
                    title={
                      register
                        ? "Already registered? Sign in"
                        : "Create an account"
                    }
                    disabled={busy}
                    onPress={() => {
                      setRegister(!register);
                      setError("");
                    }}
                  />
                </View>
              ) : (
                <>
                  {!data ? (
                    <View style={s.card}>
                      <Text>Load your account to get started.</Text>
                      <Button
                        title="Retry"
                        disabled={busy}
                        onPress={() => action(refresh)}
                      />
                    </View>
                  ) : (
                    <>
                      {tab === "Dashboard" && (
                        <>
                          <Text style={s.title}>
                            Hello, {data.profile.username}
                          </Text>
                          <Choices
                            items={["NGN", "USD"]}
                            value={currency}
                            onChange={setCurrency}
                          />
                          <View style={[s.card, s.balance]}>
                            <Text style={{ color: "#d6eee6" }}>
                              AVAILABLE BALANCE
                            </Text>
                            <Text style={s.big}>
                              {money(data.accounts[currency].balance, currency)}
                            </Text>
                            <Text style={{ color: "#d6eee6" }}>
                              Income{" "}
                              {money(data.accounts[currency].income, currency)}
                            </Text>
                            <Text style={{ color: "#d6eee6" }}>
                              Expenses{" "}
                              {money(
                                data.accounts[currency].expenses,
                                currency,
                              )}
                            </Text>
                          </View>
                          <View style={s.card}>
                            <Text style={s.title}>Savings recorded</Text>
                            <Text style={s.amount}>
                              {money(totals[currency], currency)}
                            </Text>
                            <Text style={s.muted}>
                              Manual savings records, separate from your
                              spending balance.
                            </Text>
                          </View>
                          <Button
                            title="Add a transaction"
                            onPress={() => {
                              setForm(blank());
                              setTab("Expenses");
                            }}
                          />
                          <Text style={s.title}>Recent activity</Text>
                          {data.expenses.length === 0 && (
                            <Text style={s.muted}>
                              Your first transaction starts here.
                            </Text>
                          )}
                          {[...data.expenses]
                            .sort(
                              (a, b) =>
                                b.date.localeCompare(a.date) || b.id - a.id,
                            )
                            .slice(0, 5)
                            .map((item) => (
                              <View key={item.id} style={s.card}>
                                <Text style={s.title}>{item.title}</Text>
                                <Text>
                                  {item.type === "income" ? "+" : "−"}{" "}
                                  {money(item.amount, item.currency)}
                                </Text>
                                <Text style={s.muted}>
                                  {item.category} · {item.date}
                                </Text>
                              </View>
                            ))}
                        </>
                      )}
                      {tab === "Expenses" && (
                        <>
                          {form ? (
                            <View style={s.card}>
                              <Text style={s.title}>
                                {form.id
                                  ? "Edit transaction"
                                  : "New transaction"}
                              </Text>
                              <Field
                                label="Title"
                                value={form.title}
                                onChangeText={(v) => update("title", v)}
                                maxLength={100}
                              />
                              <Field
                                label="Amount"
                                value={String(form.amount)}
                                onChangeText={(v) => update("amount", v)}
                                keyboardType="decimal-pad"
                              />
                              <Choices
                                items={["income", "expense"]}
                                value={form.type}
                                onChange={(v) => update("type", v)}
                              />
                              <Choices
                                items={["NGN", "USD"]}
                                value={form.currency}
                                onChange={(v) => update("currency", v)}
                              />
                              <Field
                                label="Category"
                                value={form.category}
                                onChangeText={(v) => update("category", v)}
                                maxLength={50}
                              />
                              <Field
                                label="Date (YYYY-MM-DD)"
                                value={form.date}
                                onChangeText={(v) => update("date", v)}
                              />
                              <Field
                                label="Description"
                                value={form.description || ""}
                                onChangeText={(v) => update("description", v)}
                                maxLength={255}
                                multiline
                              />
                              <Button
                                title="Save transaction"
                                disabled={busy}
                                onPress={() => action(saveExpense)}
                              />
                              <Button
                                title="Cancel"
                                secondary
                                disabled={busy}
                                onPress={() => setForm(null)}
                              />
                            </View>
                          ) : (
                            <Button
                              title="Add transaction"
                              onPress={() => setForm(blank())}
                            />
                          )}
                          {!data.expenses.length && (
                            <Text style={s.muted}>No transactions yet.</Text>
                          )}
                          {[...data.expenses]
                            .sort(
                              (a, b) =>
                                b.date.localeCompare(a.date) || b.id - a.id,
                            )
                            .map((item) => (
                              <View style={s.card} key={item.id}>
                                <Text style={s.title}>{item.title}</Text>
                                <Text style={s.amount}>
                                  {item.type === "income" ? "+" : "−"}{" "}
                                  {money(item.amount, item.currency)}
                                </Text>
                                <Text style={s.muted}>
                                  {item.category} · {item.date}
                                </Text>
                                {!!item.description && (
                                  <Text>{item.description}</Text>
                                )}
                                <View style={s.row}>
                                  <Button
                                    title="Edit"
                                    secondary
                                    disabled={busy}
                                    onPress={() =>
                                      setForm({
                                        ...item,
                                        amount: String(item.amount),
                                      })
                                    }
                                  />
                                  <Button
                                    title="Delete"
                                    secondary
                                    disabled={busy}
                                    onPress={() =>
                                      Alert.alert(
                                        "Delete transaction?",
                                        item.title,
                                        [
                                          { text: "Cancel", style: "cancel" },
                                          {
                                            text: "Delete",
                                            style: "destructive",
                                            onPress: () =>
                                              action(async () => {
                                                await api(
                                                  `/expenses/${item.id}`,
                                                  "DELETE",
                                                );
                                                if (form?.id === item.id)
                                                  setForm(null);
                                                await refresh();
                                              }),
                                          },
                                        ],
                                      )
                                    }
                                  />
                                </View>
                              </View>
                            ))}
                        </>
                      )}
                      {tab === "Savings" && (
                        <>
                          <View style={s.card}>
                            <Text style={s.title}>Your savings goal</Text>
                            <Text style={s.muted}>
                              The API has one shared goal without a currency.
                              Balances below stay separate; no exchange rate is
                              applied.
                            </Text>
                            <Field
                              label="Goal name"
                              value={goalName}
                              onChangeText={setGoalName}
                              maxLength={100}
                            />
                            <Field
                              label="Target amount"
                              value={target}
                              onChangeText={setTarget}
                              keyboardType="decimal-pad"
                            />
                            <Button
                              title="Save goal"
                              disabled={busy}
                              onPress={() =>
                                action(async () => {
                                  if (!goalName.trim())
                                    throw new Error("Enter a goal name.");
                                  await api("/savings/goal", "POST", {
                                    name: goalName.trim(),
                                    target_amount: positive(target),
                                  });
                                  await refresh();
                                })
                              }
                            />
                          </View>
                          <View style={s.card}>
                            <Text style={s.title}>Recorded balances</Text>
                            <Text style={s.amount}>
                              {money(totals.NGN, "NGN")}
                            </Text>
                            <Text style={s.amount}>
                              {money(totals.USD, "USD")}
                            </Text>
                          </View>
                          {data.savings.goal && (
                            <View style={s.card}>
                              <Text style={s.title}>Record a saving</Text>
                              <Text style={s.muted}>
                                This records money you saved elsewhere. It does
                                not transfer money.
                              </Text>
                              <Field
                                label="Deposit amount"
                                value={deposit}
                                onChangeText={setDeposit}
                                keyboardType="decimal-pad"
                              />
                              <Choices
                                items={["NGN", "USD"]}
                                value={currency}
                                onChange={setCurrency}
                              />
                              <Field
                                label="Saving date (YYYY-MM-DD)"
                                value={depositDate}
                                onChangeText={setDepositDate}
                              />
                              <Button
                                title="Record saving"
                                disabled={busy}
                                onPress={() =>
                                  action(async () => {
                                    await api("/savings/deposit", "POST", {
                                      amount: positive(deposit),
                                      currency,
                                      saving_date: validDate(depositDate),
                                    });
                                    setDeposit("");
                                    await refresh();
                                  })
                                }
                              />
                            </View>
                          )}
                          <Text style={s.title}>Deposit history</Text>
                          {!data.savings.deposits.length && (
                            <Text style={s.muted}>
                              No savings recorded yet.
                            </Text>
                          )}
                          {data.savings.deposits.map((item) => (
                            <View style={s.card} key={item.id}>
                              <Text style={s.amount}>
                                {money(item.amount, item.currency)}
                              </Text>
                              <Text>
                                {item.saving_date} · {item.status}
                              </Text>
                              <Text selectable style={s.muted}>
                                {item.payment_reference}
                              </Text>
                            </View>
                          ))}
                        </>
                      )}
                      {tab === "Profile" && (
                        <View style={s.card}>
                          {data.profile.profile_picture && (
                            <Image
                              accessibilityLabel="Profile photo"
                              source={{
                                uri: BASE + data.profile.profile_picture,
                              }}
                              style={s.avatar}
                            />
                          )}
                          <Text style={s.title}>{data.profile.username}</Text>
                          <Text selectable>{data.profile.email}</Text>
                          <Button
                            title="Change profile photo"
                            disabled={busy}
                            onPress={() => action(upload)}
                          />
                          <Text style={s.muted}>
                            Your API supports viewing your profile and changing
                            your photo. Contact the administrator for other
                            account changes.
                          </Text>
                          <Button
                            title="Sign out"
                            secondary
                            disabled={busy}
                            onPress={() => action(logout)}
                          />
                        </View>
                      )}
                    </>
                  )}
                </>
              )}
              {busy && (
                <ActivityIndicator
                  accessibilityLabel="Working"
                  style={{ margin: 16 }}
                />
              )}
            </ScrollView>
          )}
          {signed && (
            <View style={s.nav}>
              {["Dashboard", "Expenses", "Savings", "Profile"].map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === name }}
                  onPress={() => {
                    setTab(name);
                    setError("");
                  }}
                  style={s.navItem}
                >
                  <Text
                    style={{
                      color: tab === name ? "#12614f" : "#667875",
                      fontWeight: tab === name ? "800" : "400",
                    }}
                  >
                    {name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6f2" },
  header: { padding: 24, paddingBottom: 12 },
  brand: {
    fontSize: 11,
    letterSpacing: 3,
    color: "#196951",
    fontWeight: "800",
  },
  heading: { fontSize: 30, fontWeight: "800", color: "#142e28", marginTop: 12 },
  muted: { color: "#61756e", lineHeight: 21, marginVertical: 6 },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e9e1",
    gap: 5,
  },
  title: { fontSize: 19, fontWeight: "700", color: "#193d32", marginBottom: 8 },
  amount: { fontSize: 23, fontWeight: "700", color: "#174c44" },
  balance: { backgroundColor: "#174c44", gap: 10 },
  big: { fontSize: 32, fontWeight: "800", color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#bdcec4",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#193d32",
    backgroundColor: "#fcfdfb",
  },
  label: { fontSize: 13, fontWeight: "600", color: "#38584b", marginBottom: 7 },
  button: {
    backgroundColor: "#196951",
    padding: 14,
    borderRadius: 12,
    marginVertical: 5,
    minHeight: 48,
    alignItems: "center",
  },
  secondary: { backgroundColor: "#eaf2e8" },
  buttonText: { color: "#fff", fontWeight: "700" },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 8 },
  error: {
    backgroundColor: "#ffe5dc",
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#d5e2d7",
    backgroundColor: "#fff",
  },
  navItem: { flex: 1, paddingVertical: 20, alignItems: "center" },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
});
