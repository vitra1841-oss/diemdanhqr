// ============================
// SUGGESTIONS (AUTOCOMPLETE)
// ============================

export function clearSuggestions() {
  const list = document.getElementById("suggestions");
  list.innerHTML = "";
}

export function showSuggestions(matches, onSelectCallback) {
  const list = document.getElementById("suggestions");
  list.innerHTML = "";

  if (!Array.isArray(matches) || matches.length === 0) return;

  matches.forEach((student) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = `${student.id} | ${student.idName}`;

    const lopSpan = document.createElement("span");
    lopSpan.textContent = student.lop || "";
    lopSpan.style.flexShrink = "0";
    lopSpan.style.color = "#8e8e8f";
    lopSpan.style.fontSize = "13px";

    li.appendChild(nameSpan);
    li.appendChild(lopSpan);

    li.addEventListener("click", () => {
      clearSuggestions();
      if (typeof onSelectCallback === "function") onSelectCallback(student);
    });

    list.appendChild(li);
  });
}
