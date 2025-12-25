import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-card">
        <h1 className="landing-title">Податковий кабінет TaxAgent</h1>

        <p className="landing-lead">
          Один застосунок для контролю ваших податкових зобов&apos;язань, звітів та
          платежів.
        </p>

        <p className="landing-text">
          Ви можете відстежувати суми до сплати, переглядати історію поданих
          звітів та готуватися до наступних податкових періодів в зручному
          інтерфейсі.
        </p>

        <div className="landing-actions">
          <button
            type="button"
            className="landing-btn landing-btn-primary"
            onClick={() => navigate("/login")}
          >
            Перейти до кабінету
          </button>

          <button
            type="button"
            className="landing-btn landing-btn-outline"
            onClick={() => navigate("/register")}
          >
            Створити акаунт
          </button>
        </div>
      </div>
    </div>
  );
}
