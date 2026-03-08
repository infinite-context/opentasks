import { escapeHtml, renderIcon } from "../utils";

export interface ProjectsViewProps {
  keyValue: string;
  nameValue: string;
  errorMessage: string;
  isSubmitting: boolean;
}

export function renderProjectsView(props: ProjectsViewProps): string {
  const { keyValue, nameValue, errorMessage, isSubmitting } = props;

  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Workspace setup</div>
          <h2>Create project</h2>
        </div>
      </div>

      <p class="detail-summary">
        Create a new project to establish its goal tree and start routing work through the orchestrator.
      </p>

      ${errorMessage ? `<div class="form-callout form-callout--error">${escapeHtml(errorMessage)}</div>` : ""}

      <form class="project-form" data-project-create-form>
        <label class="field">
          <span class="field__label">Project name</span>
          <input
            class="field__input"
            data-project-name-input
            name="name"
            placeholder="Frontend rewrite"
            required
            type="text"
            value="${escapeHtml(nameValue)}"
          />
        </label>

        <label class="field">
          <span class="field__label">Project key</span>
          <input
            class="field__input"
            data-project-key-input
            name="key"
            placeholder="frontend-rewrite"
            required
            type="text"
            value="${escapeHtml(keyValue)}"
          />
        </label>

        <div class="project-form__actions">
          <button class="button button--primary" ${isSubmitting ? "disabled" : ""} type="submit">
            <span class="button__content">
              ${renderIcon("fa-solid fa-plus")}
              <span>${isSubmitting ? "Creating project..." : "Create project"}</span>
            </span>
          </button>
        </div>
      </form>
    </section>
  `;
}
