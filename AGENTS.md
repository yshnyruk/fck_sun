## 1. Project Overview

You are an AI-first senior full-stack software engineer working on **FckSun**, a mobile-first web application for shade-aware walking navigation.

Your responsibility is to design, implement, test, and maintain a reliable application that helps people find more comfortable walking routes by estimating shade coverage at the time they travel.

FckSun prioritizes environmental comfort over pure walking speed.

### Product vision

Help people find walking routes that balance:
- Shade coverage.
- Walking distance.
- Estimated walking duration.
- Geographic data availability and confidence.

Users should be able to choose a destination, configure their shade preference, plan their departure or arrival time, compare routes, and navigate along their selected route.

The application should support worldwide coverage wherever sufficient geographic data is available.

### Core engineering philosophy

- Build a reliable product, not a technical demonstration.
- Prioritize correctness over implementation shortcuts.
- Keep the architecture modular and maintainable.
- Prefer simple solutions over unnecessary abstractions.
- Treat AI-generated code as production code that requires validation.
- Never fabricate shade information or geographic data.
- Preserve existing product decisions unless explicitly instructed otherwise.

---

## 2. Product Requirements

The Product Requirements Document (PRD.md) is the primary reference for product functionality.

Before implementing a feature, understand its relevant requirements.

### Core product functionality

The application must support:

1. Starting-location selection:
   - Current GPS location.
   - Manually selected location.

2. Destination search:
   - Location autocomplete.
   - Destination selection.

3. Pedestrian route planning:
   - Walking distance.
   - Estimated duration.
   - Route geometry.
   - Recommended route.
   - Meaningful alternative routes.

4. Shade preferences:
   - Full.
   - More.
   - Medium.
   - Less.
   - No Shadow.

5. Time-aware route planning:
   - Leave now.
   - Depart at a specified time.
   - Arrive by a specified time.

6. Shade estimation:
   - Buildings.
   - Trees and vegetation.
   - Bridges.
   - Tunnels.
   - Covered walkways.
   - Canopies and other structures.

7. Route visualization:
   - Overall estimated shade coverage.
   - Segment-level shade information.
   - Shaded and exposed sections.
   - Distance and duration.
   - Data confidence.

8. Navigation:
   - Current GPS position.
   - Selected route.
   - Route progress.
   - Remaining distance.
   - Estimated remaining time.
   - Shade information along the route.

9. Recent destinations:
   - Locally stored history.
   - Destination reuse.
   - History clearing.

10. Current shadows map:
    - Estimated current shadow conditions.
    - Shaded and exposed areas.
    - Map legend.
    - Geographic data limitations.

### Product principles

These principles are mandatory:

- Comfort over pure speed.
- Shade is a preference, not a strict requirement.
- Route recommendations must account for actual walking times.
- Missing data must never be interpreted as confirmed sunlight.
- Standard walking routes must remain available without shade data.
- Geographic coverage and confidence must be communicated transparently.
- Shade preferences influence route scoring rather than enforcing minimum shade percentages.

### Important shade preference interpretation

"No Shadow" means shade has minimal importance in route scoring. It does NOT mean actively seeking sunlight.

Do not implement shade preferences as arbitrary fixed minimum shade thresholds.

### Weather exclusion

Weather variables are excluded from MVP route optimization.

Do not introduce temperature, precipitation, humidity, wind, or cloud cover into route scoring unless explicitly requested.

---

## 3. Technology Stack

Use the established technology stack.

### Frontend

- React.
- TypeScript.
- Tailwind CSS.
- MapLibre GL JS.

### Backend

- Python.
- FastAPI.

### Storage

- Browser localStorage.

No user registration or authentication is required for the MVP.

### Testing

- Vitest.
- pytest.
- Playwright.

### External services and libraries

- ShadeMap.
- GraphHopper.
- MapLibre GL JS.

### Internal modules

- Python shade-calculation module.
- Python route-scoring module.

Do not introduce additional frameworks, databases, state-management libraries, or infrastructure without a clear technical justification.

If an additional dependency is necessary:
1. Explain why it is needed.
2. Consider existing alternatives.
3. Evaluate its maintenance and complexity.
4. Prefer lightweight and well-maintained solutions.

---

## 4. System Architecture

Maintain the established frontend/backend separation.

### Frontend responsibilities

The React application is responsible for:

- User interface and interactions.
- Location selection.
- Destination autocomplete.
- Map rendering.
- Route visualization.
- Shade preference selection.
- Departure and arrival time selection.
- GPS tracking.
- Navigation presentation.
- Recent destination management.
- Communication with the backend API.

MapLibre GL JS is responsible for map rendering and geographic visualization.

Use localStorage for device-local recent destinations and other explicitly approved local preferences.

### Backend responsibilities

FastAPI is responsible for:

- API request validation.
- Route planning orchestration.
- GraphHopper integration.
- ShadeMap integration.
- Shade estimation.
- Solar-position calculations.
- Route scoring.
- Route response construction.
- Geographic data-confidence handling.

### Internal architecture

Keep the following components logically separated:

**Route Planning Module**
- Generate pedestrian route candidates.
- Retrieve route geometry.
- Calculate distance and duration.
- Integrate GraphHopper.

**Shade Calculation Module**
- Integrate ShadeMap.
- Estimate shade conditions.
- Calculate solar position.
- Evaluate shade at expected segment arrival times.
- Distinguish known and unknown conditions.

**Route Scoring Module**
- Evaluate route candidates.
- Balance shade, distance, and duration.
- Apply user shade preferences.
- Rank feasible alternatives.

**External Service Adapters**
- Isolate external API integrations.
- Normalize external responses.
- Handle provider errors.
- Avoid leaking provider-specific implementation details into business logic.

Keep business logic independent of external service implementations wherever practical.

---

## 5. API Conventions

Follow the existing API specification in API_ENDPOINTS.md.

Use the `/api/v1` prefix for application endpoints.

### Required endpoints

#### POST /api/v1/routes

Generate a recommended walking route and meaningful alternatives.

The response should contain the information necessary for route visualization and comparison, including:

- Route geometry.
- Distance.
- Estimated duration.
- Shade estimates.
- Data confidence.

#### GET /api/v1/shadows

Return estimated shadow information for a requested map viewport and time.

#### GET /api/v1/search

Provide location autocomplete for starting points and destinations.

#### GET /api/v1/health

Check backend availability.

### Deferred endpoints

Do not implement these without an actual requirement:

- POST `/api/v1/routes/{route_id}/recalculate`
- GET `/api/v1/routes/{route_id}`

### API engineering rules

- Use Pydantic models for request and response validation.
- Define explicit request and response schemas.
- Use appropriate HTTP status codes.
- Return consistent error structures.
- Validate user-provided coordinates and timestamps.
- Handle external API failures gracefully.
- Avoid exposing API keys or sensitive provider information.
- Keep endpoint handlers thin.
- Move business logic into dedicated modules.
- Document non-obvious API behavior.

Do not invent API contracts independently of the existing specification.

When a contract needs to evolve, update its documentation and corresponding frontend/backend types.

---

## 6. Shade Calculation Rules

Shade estimation is one of the most important parts of FckSun.

Correctness and transparency take priority over producing attractive but unreliable estimates.

### Time-aware shade estimation

Shade must be calculated for the expected time at which the user reaches each route segment.

Do not calculate shade using only the route's departure time.

The calculation should account for:

- Route departure time.
- Expected walking duration.
- Segment position.
- Expected segment arrival time.
- Solar position at the relevant time.
- Available geographic shade data.

Use consistent timezone handling.

Store and exchange timestamps using an unambiguous representation. Convert to local time for user-facing presentation.

### Shade sources

Incorporate available reliable shade sources:

- Buildings.
- Trees and vegetation.
- Bridges.
- Tunnels.
- Covered walkways.
- Canopies and other structures.

Do not assume every external provider supports every shade source.

Document actual provider capabilities and limitations.

### Shade classification

The system must distinguish:

1. Confirmed shade.
2. Confirmed exposure.
3. Unknown conditions.

Never convert missing geographic information into confirmed exposure.

### Coverage confidence

Support three coverage states:

- High coverage.
- Partial coverage.
- Insufficient coverage.

When coverage is insufficient:
- Do not generate misleading shade-based recommendations.
- Preserve standard pedestrian routing.
- Communicate that shade estimates are unavailable.

When coverage is partial:
- Use available information.
- Communicate uncertainty.
- Avoid presenting estimates as complete geographic truth.

---

## 7. Route Optimization Rules

Route scoring must balance three primary factors:

1. Estimated shade coverage.
2. Walking distance.
3. Estimated walking duration.

The selected shade preference determines the relative importance of these factors.

### Optimization principles

- Prefer comfortable routes when shade is important.
- Avoid excessive detours for insignificant shade improvements.
- Preserve reasonable walking distance and duration.
- Return the highest-scoring feasible route.
- Provide meaningful alternatives when available.
- Do not optimize using unknown shade as though it were confirmed shade or exposure.

### Important implementation guidance

Exact scoring weights and optimization parameters are technical design decisions.

Do not invent arbitrary scoring values without documenting the rationale.

Keep scoring logic isolated, testable, and configurable.

Do not embed optimization logic inside API endpoints or frontend components.

---

## 8. Frontend Engineering Standards

### TypeScript

- Use strict TypeScript wherever possible.
- Avoid `any`.
- Define explicit interfaces and types.
- Prefer reusable, well-defined data models.
- Avoid unnecessary type assertions.
- Handle nullable and optional values explicitly.

### React

- Use functional components and hooks.
- Keep components focused on a single responsibility.
- Separate business logic from presentation.
- Extract reusable functionality into custom hooks when appropriate.
- Avoid unnecessarily large components.
- Avoid excessive prop drilling.
- Use predictable state management.

### Tailwind CSS

- Use Tailwind utility classes consistently.
- Build reusable UI patterns.
- Avoid unnecessary inline styling.
- Maintain consistent spacing, typography, and visual hierarchy.
- Prioritize mobile usability.

### MapLibre

- Keep map rendering logic separate from route and shade calculations.
- Manage map lifecycle and cleanup correctly.
- Avoid unnecessary map reinitialization.
- Use appropriate GeoJSON structures.
- Handle map loading and rendering errors.
- Ensure route and shade layers remain visually distinguishable.

### User experience

The interface should be:

- Mobile-first.
- Responsive.
- Intuitive.
- Accessible.
- Fast.
- Visually consistent.

Always provide appropriate loading, empty, error, and unavailable-data states.

Never show fake route or shade data to make the interface appear complete.

---

## 9. Backend Engineering Standards

### Python

- Use type hints.
- Follow PEP 8.
- Use clear function and variable names.
- Keep functions focused.
- Avoid unnecessary abstractions.
- Separate domain logic from infrastructure.
- Validate external data.
- Handle exceptions explicitly.

### FastAPI

- Use Pydantic models.
- Keep route handlers lightweight.
- Use dependency injection where appropriate.
- Separate API, service, integration, and domain responsibilities.
- Avoid synchronous blocking operations in asynchronous request handlers.
- Configure CORS deliberately.
- Validate all external service responses.

### External integrations

GraphHopper and ShadeMap must be accessed through dedicated adapters.

Never scatter external provider requests throughout the application.

Adapters should:
- Normalize responses.
- Handle timeouts.
- Handle unavailable services.
- Validate returned data.
- Provide useful error information.
- Avoid exposing provider-specific response formats to unrelated modules.

Never hardcode API credentials.

Use environment variables and an appropriate local environment configuration.

---

## 10. Data and State Management

The MVP does not require a backend database or user accounts.

### localStorage

Use localStorage for:
- Recent destinations.
- Other explicitly approved device-local preferences.

Implement:
- Safe serialization and deserialization.
- Missing-data handling.
- Invalid-data handling.
- Storage versioning when appropriate.
- History clearing.

Do not store sensitive information unnecessarily.

Do not assume localStorage is always available.

### Geographic data

Use consistent geographic coordinate conventions.

Clearly distinguish:
- Latitude and longitude.
- GeoJSON coordinate ordering.
- Distance units.
- Timezones.
- UTC timestamps.
- Local display times.

Be especially careful about coordinate ordering when integrating different providers.

---

## 11. Testing Requirements

Testing is mandatory for meaningful functionality.

### Frontend — Vitest

Test:
- Components.
- Custom hooks.
- Utility functions.
- Shade preference behavior.
- Route presentation.
- Time calculations.
- localStorage behavior.
- API integration logic.

### Backend — pytest

Test:
- API endpoints.
- Request validation.
- Route planning.
- Shade calculation.
- Solar-position calculations.
- Route scoring.
- Confidence classification.
- External integration error handling.

### End-to-end — Playwright

Test important user journeys:

1. Open the application.
2. Select a starting location.
3. Search for a destination.
4. Select a shade preference.
5. Choose a planning mode.
6. Generate walking routes.
7. Compare route alternatives.
8. View shade information.
9. Select a route.
10. Start navigation.

Also test:
- Missing shade data.
- Partial geographic coverage.
- External API failures.
- Location permission denial.
- Invalid destination input.
- Mobile layouts.

### Testing principles

- Test behavior, not implementation details.
- Prefer deterministic tests.
- Mock external services in unit and integration tests.
- Never depend on live third-party services for ordinary unit tests.
- Include edge cases.
- Do not mark functionality complete without relevant tests.

---

## 12. Security and Reliability

Follow secure development practices.

- Never commit API keys or secrets.
- Never expose private backend credentials in frontend code.
- Validate incoming requests.
- Sanitize user-controlled input where relevant.
- Apply appropriate request timeouts.
- Handle third-party service failures.
- Avoid leaking stack traces or internal details to users.
- Avoid unnecessary personal data collection.
- Respect browser location permissions.
- Do not silently fall back to misleading geographic estimates.

The application should degrade gracefully when external services are unavailable.

---

## 13. MVP Scope Control

Do not introduce features outside the approved MVP without explicit approval.

### Included in MVP

- Destination search.
- Starting-location selection.
- Pedestrian routing.
- Five shade preferences.
- Departure-time and arrival-time planning.
- Multiple shade sources where reliable data exists.
- Time-aware shade calculation.
- Route recommendation.
- Meaningful route alternatives.
- Overall and segment-level shade visualization.
- GPS-based visual navigation.
- Recent destinations.
- Current shadows map.
- Geographic coverage and confidence handling.

### Excluded from MVP

- User accounts.
- Authentication.
- Social functionality.
- Route sharing.
- Voice navigation.
- Offline maps.
- Native mobile applications.
- Weather-based comfort scoring.
- Historical shadow exploration.
- Advanced thermal comfort modeling.
- Custom shade-preference sliders.

Do not introduce excluded features as part of unrelated implementation work.

---

## 14. Development Workflow for AI Agents

Follow this workflow when implementing any feature.

### Step 1 — Understand

Before changing code:

- Read the relevant project documentation.
- Inspect the existing repository structure.
- Identify affected components and modules.
- Understand existing conventions.
- Identify dependencies and integration points.

Never assume the repository matches an imagined architecture.

### Step 2 — Plan

For non-trivial tasks:

- Identify the required changes.
- Determine frontend and backend responsibilities.
- Identify API contract changes.
- Consider edge cases.
- Define appropriate tests.
- Identify potential regressions.

Prefer a small, focused implementation plan.

### Step 3 — Implement

- Make the smallest coherent change.
- Follow established architecture.
- Reuse existing functionality.
- Avoid unnecessary dependencies.
- Keep modules focused.
- Add appropriate types and validation.
- Add or update tests.

Do not rewrite unrelated code.

### Step 4 — Validate

Before considering the task complete:

- Run relevant tests.
- Run TypeScript checks.
- Run linting when configured.
- Run backend tests.
- Verify affected functionality.
- Check for regressions.

Do not claim that tests passed unless they were actually executed.

### Step 5 — Report

At completion, summarize:

1. What was implemented.
2. Which files were changed.
3. Important technical decisions.
4. Tests executed and their results.
5. Known limitations or outstanding issues.

---

## 15. Decision-Making Rules

AI agents are expected to exercise senior engineering judgment.

### When requirements are unclear

- Consult the PRD.
- Inspect existing implementations.
- Check architecture and API documentation.
- Prefer established conventions.
- Avoid introducing irreversible decisions.

Ask for clarification when an unresolved decision materially affects product behavior, architecture, or data correctness.

### When requirements conflict

Use this priority order:

1. Explicit instructions from the project owner.
2. Approved product decisions.
3. PRD.md.
4. ARCHITECTURE.md.
5. API_ENDPOINTS.md.
6. TECH_STACK.md.
7. Existing implementation and established code conventions.

Do not silently resolve important product conflicts.

Document proposed changes and explain their implications.

### When proposing improvements

Think beyond simply making code work.

Consider:
- Maintainability.
- Reliability.
- Performance.
- Scalability.
- User experience.
- Data correctness.
- Testing.
- Operational complexity.

Prefer solutions appropriate for the current MVP rather than prematurely building a large-scale production platform.

---

## 16. Definition of Done

A feature is complete only when:

- It satisfies the relevant product requirements.
- It follows the established architecture.
- Frontend and backend contracts are consistent.
- Input and output data are validated.
- Error states are handled.
- Loading and unavailable-data states are implemented where relevant.
- Appropriate tests exist.
- Relevant tests have been executed.
- No unrelated functionality has been broken.
- Documentation has been updated when necessary.

A visually working interface is not sufficient if the underlying data or calculations are incorrect.

A functioning backend is not sufficient if the user-facing behavior is misleading.

---

## 17. Final Instruction to AI Agents

Act as a senior engineer and technical partner, not merely a code generator.

Your primary objective is to help build FckSun into a reliable, maintainable, and genuinely useful shade-aware walking navigation product.

Always:

- Understand the product before coding.
- Respect approved decisions.
- Think about the entire system.
- Prioritize data correctness.
- Communicate uncertainty.
- Write maintainable code.
- Test important behavior.
- Avoid unnecessary complexity.
- Keep the MVP focused.

**The most important rule: Never sacrifice the correctness of shade estimates or user trust for the appearance of a working feature.**