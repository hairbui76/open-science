import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Input, Select } from "./Input";
import { Panel } from "./Panel";
import { Segmented } from "./Segmented";

describe("Button", () => {
  it("defaults to type=button so a toolbar button never submits its form", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Filter</Button>
      </form>,
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveAttribute("type", "button");
  });

  it("paints primary out of the ink accent, not the brand hue", () => {
    render(<Button variant="primary">Save</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-accent");
    expect(cls).not.toContain("bg-brand");
  });

  it("offers the brand fill as its own variant, so its use stays countable", () => {
    render(<Button variant="brand">Start</Button>);
    expect(screen.getByRole("button").className).toContain("bg-brand");
  });

  it("is pill-shaped at every size", () => {
    render(
      <>
        <Button size="sm">a</Button>
        <Button size="md">b</Button>
      </>,
    );
    for (const b of screen.getAllByRole("button")) expect(b.className).toContain("rounded-pill");
  });

  it("does not fire while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("names itself for a screen reader, having no visible text", () => {
    render(<IconButton label="Close pane">×</IconButton>);
    expect(screen.getByRole("button", { name: "Close pane" })).toBeInTheDocument();
  });
});

describe("Chip", () => {
  it("takes the brand tint when selected", () => {
    const { rerender } = render(<Chip>Sonnet</Chip>);
    expect(screen.getByRole("button").className).not.toContain("bg-brand-soft");

    rerender(<Chip selected>Sonnet</Chip>);
    expect(screen.getByRole("button").className).toContain("bg-brand-soft");
  });

  it("stays silent about aria-pressed unless told it is a toggle", () => {
    // `selected` is visual. A popover trigger is a selected-looking chip that
    // is NOT a toggle, and announcing one would be a lie to a screen reader.
    render(<Chip selected>Model</Chip>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("emits aria-pressed when the caller opts in", () => {
    const { rerender } = render(<Chip pressed={false}>Filter</Chip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(
      <Chip selected pressed>
        Filter
      </Chip>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("a read-only chip is inert but must not look disabled", () => {
    render(<Chip readOnly>workspace</Chip>);
    const chip = screen.getByRole("button");
    expect(chip).toBeDisabled();
    expect(chip).not.toHaveAttribute("aria-pressed");
    expect(chip.className).toContain("disabled:opacity-100");
  });
});

describe("Segmented", () => {
  const OPTIONS = [
    { value: "preview", label: "Preview" },
    { value: "code", label: "Code" },
  ] as const;

  it("exposes one radio per option with the current one checked", () => {
    render(<Segmented label="View" options={OPTIONS} value="code" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Code" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Preview" })).not.toBeChecked();
  });

  it("keeps the group to a single tab stop", () => {
    render(<Segmented label="View" options={OPTIONS} value="code" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Code" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Preview" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves the value with the arrow keys, wrapping at the ends", async () => {
    const onChange = vi.fn();
    render(<Segmented label="View" options={OPTIONS} value="code" onChange={onChange} />);
    const selected = screen.getByRole("radio", { name: "Code" });
    selected.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("selects on click", async () => {
    const onChange = vi.fn();
    render(<Segmented label="View" options={OPTIONS} value="code" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Preview" }));
    expect(onChange).toHaveBeenCalledWith("preview");
  });
});

describe("touch targets", () => {
  // The coarse-pointer rule in index.css grows every control to 40px for the
  // phone-width gateway web client. It keys off this marker, so a primitive
  // that loses it silently ships a 28px tap target.
  it("marks every interactive primitive", () => {
    render(
      <>
        <Button>Save</Button>
        <IconButton label="Close">×</IconButton>
        <Chip>Model</Chip>
        <Segmented
          label="View"
          options={[{ value: "a", label: "A" }] as const}
          value="a"
          onChange={() => {}}
        />
      </>,
    );
    const controls = screen.getAllByRole("button").concat(screen.getAllByRole("radio"));
    expect(controls).toHaveLength(4);
    for (const c of controls) expect(c).toHaveAttribute("data-ui-control");
  });
});

describe("Card and Panel", () => {
  it("a card is flat by default and shadowed only when raised", () => {
    const { rerender } = render(<Card data-testid="c">body</Card>);
    expect(screen.getByTestId("c").className).not.toContain("shadow-card");
    rerender(
      <Card raised data-testid="c">
        body
      </Card>,
    );
    expect(screen.getByTestId("c").className).toContain("shadow-card");
  });

  it("a panel floats on --panel and lifts", () => {
    render(<Panel data-testid="p">rail</Panel>);
    const cls = screen.getByTestId("p").className;
    expect(cls).toContain("bg-panel");
    expect(cls).toContain("shadow-lift");
  });

  it("the glass variant defers to the .panel-glass rule, which owns the opaque fallback", () => {
    render(
      <Panel glass data-testid="p">
        menu
      </Panel>,
    );
    const cls = screen.getByTestId("p").className;
    expect(cls).toContain("panel-glass");
    // Never a bare Tailwind backdrop utility: that would frost without a
    // guaranteed opaque fallback where backdrop-filter is unsupported.
    expect(cls).not.toContain("backdrop-blur");
    expect(cls).not.toContain("bg-panel");
  });
});

describe("Input and Select", () => {
  it("share the field shape", () => {
    render(
      <>
        <Input aria-label="Name" />
        <Select aria-label="Model">
          <option>a</option>
        </Select>
      </>,
    );
    expect(screen.getByLabelText("Name").className).toContain("rounded-input");
    expect(screen.getByLabelText("Model").className).toContain("rounded-input");
  });

  it("the select draws the app's own chevron instead of native chrome", () => {
    render(
      <Select aria-label="Model">
        <option>a</option>
      </Select>,
    );
    expect(screen.getByLabelText("Model").className).toContain("select-chrome");
  });
});
