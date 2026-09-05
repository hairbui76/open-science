import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AcpConfigPicker } from "./AcpConfigPicker";

const MODEL = {
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "sonnet",
  options: [
    { value: "default", name: "Default" },
    { value: "sonnet", name: "Sonnet" },
  ],
};

describe("AcpConfigPicker", () => {
  it("paints every option for the current theme, not the browser's default menu", () => {
    // In dark theme the native <select> menu was white with the page's light
    // text on it — unreadable. The option elements carry the theme's own
    // surface and text so Chromium paints the menu from them.
    render(<AcpConfigPicker options={[MODEL]} onChange={() => {}} />);
    for (const o of screen.getAllByRole("option")) {
      expect(o.className).toContain("bg-surface");
      expect(o.className).toContain("text-text");
    }
  });

  it("reports the option id and the chosen value", async () => {
    const onChange = vi.fn();
    render(<AcpConfigPicker options={[MODEL]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Model" }), "default");
    expect(onChange).toHaveBeenCalledWith("model", "default");
  });

  it("renders nothing for an option with nothing to choose from", () => {
    const { container } = render(<AcpConfigPicker options={[{ id: "x", options: [] }]} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
