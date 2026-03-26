// ============================
// SUGGESTIONS (AUTOCOMPLETE)
// ============================

export function showSuggestions(value, studentDB, onSelectCallback) {
  const list = document.getElementById("suggestions");
  list.innerHTML = "";
  if (value.length < 1) return;

  const valueLower = value.toLowerCase().normalize("NFC");
  const matches = [];

  for (let id in studentDB) {
    const s = studentDB[id];
    const hoTen = s.hoTen.toLowerCase().normalize("NFC");
    const full = ((s.tenThanh || "") + " " + s.hoTen).toLowerCase().normalize("NFC");

    if (
      id.startsWith(value) ||
      hoTen.includes(valueLower) ||
      full.includes(valueLower)
    ) {
      matches.push({ id, ...s });
      if (matches.length >= 5) break;
    }
  }

  matches.forEach((m) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = m.id + " | " + m.idName;

    const lopSpan = document.createElement("span");
    lopSpan.textContent = m.lop || "";
    lopSpan.style.flexShrink = "0";
    lopSpan.style.color = "#8e8e8f";
    lopSpan.style.fontSize = "13px";

    li.appendChild(nameSpan);
    li.appendChild(lopSpan);

    li.addEventListener("click", () => {
      document.getElementById("manualInput").value = m.id;
      list.innerHTML = "";
      if (typeof onSelectCallback === "function") onSelectCallback(m.id);
    });
    list.appendChild(li);
  });
}