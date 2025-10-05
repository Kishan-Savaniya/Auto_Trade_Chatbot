// If already logged in, go straight to dashboard
(async () => {
  try {
    const r = await fetch("http://localhost:4000/api/auth/me", {
      credentials: "include",
      cache: "no-store"
    });
    if (r.ok) return location.replace("index.html"); // no back to login
  } catch {}
})();


const API_BASE = "http://localhost:4000";
function j(x) {
  return document.getElementById(x);
}
async function post(p, body) {
  const r = await fetch(API_BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {}),
  });
  const jx = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(jx.error || "HTTP " + r.status);
  return jx;
}
j("tabLogin").onclick = () => {
  j("tabLogin").classList.add("active");
  j("tabRegister").classList.remove("active");
  j("loginForm").classList.remove("hide");
  j("registerForm").classList.add("hide");
  j("lmsg").textContent = "";
};
j("tabRegister").onclick = () => {
  j("tabRegister").classList.add("active");
  j("tabLogin").classList.remove("active");
  j("registerForm").classList.remove("hide");
  j("loginForm").classList.add("hide");
  j("rmsg").textContent = "";
};
j("btnLogin").onclick = async () => {
  try {
    // optional UX hardening: prevent double-submit
    j("btnLogin").disabled = true;

    const r = await fetch("http://localhost:4000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        username: j("luser").value.trim(),
        password: j("lpass").value
      })
    });

    if (!r.ok) {
      const jx = await r.json().catch(() => ({}));
      throw new Error(jx.error || `Login failed (${r.status})`);
    }

    // success → go to dashboard, remove login from history
    location.replace("index.html");
  } catch (e) {
    j("lmsg").textContent = e.message || "Login failed";
  } finally {
    j("btnLogin").disabled = false;
  }
};

j("btnRegister").onclick = async () => {
  try {
    const body = {
      username: j("ruser").value.trim(),
      password: j("rpass").value,
      email: j("remail").value.trim(),
      fullName: j("rname").value.trim(),
      gender: j("rgender").value,
      birthdate: j("rbirth").value,
      address: j("raddr").value.trim(),
      phone: j("rphone").value.trim(),
    };
    const r = await post("/api/auth/register", body);
    location.href = "index.html";
  } catch (e) {
    j("rmsg").textContent = e.message;
  }
};
