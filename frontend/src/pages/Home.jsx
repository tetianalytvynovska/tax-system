export default function HomePage({ user }) {
  return (
    <div className="page">
      <div className="card">
        <div className="card-title">ІНФОРМАЦІЙНА СИСТЕМА TAXAGENT</div>
        <div className="card-subtitle">
          Супровід податкової звітності фізичних осіб.
        </div>
        <p className="muted-text">
          Система дозволяє користувачам фіксувати доходи, розраховувати податкові
          зобов&apos;язання та формувати декларації. Адміністратор налаштовує довідники
          податків, ставки і терміни сплати, а також формує зведену звітність.
        </p>
        {user ? (
          <p>
            Ви увійшли як{" "}
            <b>{user.role === "Administrator" ? "адміністратор" : "користувач"}</b>.
          </p>
        ) : (
          <p>Щоб продовжити роботу, увійдіть або зареєструйтесь.</p>
        )}
      </div>
    </div>
  );
}