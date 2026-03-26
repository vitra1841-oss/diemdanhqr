// ============================
// LOGIN PAGE
// ============================

const params = new URLSearchParams(location.search);
    if (params.get("error") === "unauthorized") {
      document.getElementById("errorBanner").style.display = "block";
    }
    function togglePassword() {
      const input = document.getElementById("password");
      const icon = document.getElementById("eyeIcon");
      if (input.type === "password") {
        input.type = "text";
        icon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      `;
      } else {
        input.type = "password";
        icon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      `;
      }
    }
    let startY = 0;
    let isPulling = false;
    const pullIndicator = document.getElementById("pullIndicator");

    document.addEventListener("touchstart", (e) => {
      startY = e.touches[0].clientY;
      isPulling = false;
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      const y = e.touches[0].clientY;
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const pulled = y - startY;
      if (scrollTop === 0 && pulled > 40) {
        isPulling = true;
        pullIndicator.classList.add("show");
      } else {
        isPulling = false;
        pullIndicator.classList.remove("show");
      }
    }, { passive: true });

    document.addEventListener("touchend", () => {
      pullIndicator.classList.remove("show");
      if (isPulling) {
        isPulling = false;
        setTimeout(() => window.location.reload(), 200);
      }
    });
