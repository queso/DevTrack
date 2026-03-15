import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ErrorPage from "@/app/error"
import Loading from "@/app/loading"
import NotFound from "@/app/not-found"

describe("ErrorPage", () => {
  const defaultError = new Error("Something went wrong")
  const defaultReset = vi.fn()

  it("renders a user-friendly error message", () => {
    render(<ErrorPage error={defaultError} reset={defaultReset} />)

    // Should show a friendly message, not the raw error string
    expect(screen.getByRole("heading", { name: /an unexpected error occurred/i })).toBeInTheDocument()
    expect(screen.getByText(/we ran into a problem loading this page/i)).toBeInTheDocument()
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument()
  })

  it("renders a try again button that calls reset", async () => {
    const reset = vi.fn()
    const user = userEvent.setup()

    render(<ErrorPage error={defaultError} reset={reset} />)

    const button = screen.getByRole("button", { name: /try again/i })
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(reset).toHaveBeenCalledOnce()
  })
})

describe("NotFound", () => {
  it("renders a not found message with a link home", () => {
    render(<NotFound />)

    expect(screen.getByRole("heading", { name: /404.*page not found/i })).toBeInTheDocument()
    expect(screen.getByText(/the page you are looking for does not exist or has been moved/i)).toBeInTheDocument()

    const homeLink = screen.getByRole("link", { name: /go back home/i })
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute("href", "/")
  })
})

describe("Loading", () => {
  it("renders a loading indicator", () => {
    render(<Loading />)

    // Verify the spinner element exists
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()

    // Verify accessible loading text
    expect(screen.getByText("Loading")).toBeInTheDocument()
  })
})
