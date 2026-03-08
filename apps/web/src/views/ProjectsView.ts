import { escapeHtml, renderIcon } from "../utils";

export interface ProjectsViewProps {
  keyValue: string;
  nameValue: string;
  descriptionValue: string;
  workingDirectoryValue: string;
  workingDirectoryValid: boolean | null;
  workingDirectoryError: string;
  browseLoading: boolean;
  errorMessage: string;
  isSubmitting: boolean;
}

export function renderProjectsView(props: ProjectsViewProps): string {
  const {
    keyValue,
    nameValue,
    descriptionValue,
    workingDirectoryValue,
    workingDirectoryValid,
    workingDirectoryError,
    browseLoading,
    errorMessage,
    isSubmitting
  } = props;

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
            placeholder="My Project"
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
            placeholder="my-project"
            required
            type="text"
            value="${escapeHtml(keyValue)}"
          />
        </label>

        <label class="field">
          <span class="field__label">Description</span>
          <input
            class="field__input"
            data-project-description-input
            name="description"
            placeholder="Description of project and objectives"
            required
            type="text"
            value="${escapeHtml(descriptionValue)}"
          />
        </label>

        <label class="field">
          <span class="field__label">Working directory</span>
          <div class="input-with-browse">
            <input
              class="field__input input-with-browse__input ${workingDirectoryValid === false ? "input-with-browse__input--invalid" : ""}"
              data-project-working-directory-input
              name="workingDirectory"
              placeholder="C:\\path\\to\\project "
              required
              type="text"
              value="${escapeHtml(workingDirectoryValue)}"
            />
            <button class="input-with-browse__browse" data-project-browse type="button" title="Browse folders" ${browseLoading ? "disabled" : ""}>
              <span class="button__content">
                ${browseLoading ? renderIcon("fa-solid fa-spinner fa-spin") : renderIcon("fa-solid fa-folder-open")}
              </span>
            </button>
          </div>
          <div class="field__hint field__hint--muted">Full path to the project directory.</div>
          ${workingDirectoryError ? `<div class="field__hint field__hint--error">${escapeHtml(workingDirectoryError)}</div>` : ""}
          ${workingDirectoryValid === true ? `<div class="field__hint field__hint--success">Directory exists</div>` : ""}
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
