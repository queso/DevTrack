package output

import (
	"os"
	"strings"
	"testing"
)

// captureStdout redirects os.Stdout to a pipe, runs f, and returns everything
// written to stdout as a string. It restores os.Stdout before returning.
func captureStdout(t *testing.T, f func()) string {
	t.Helper()

	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}

	origStdout := os.Stdout
	os.Stdout = w

	f()

	w.Close()
	os.Stdout = origStdout

	var buf strings.Builder
	tmp := make([]byte, 1024)
	for {
		n, _ := r.Read(tmp)
		if n == 0 {
			break
		}
		buf.Write(tmp[:n])
	}
	r.Close()

	return buf.String()
}

// ---------------------------------------------------------------------------
// PrintTable — JSON object (key-value table)
// ---------------------------------------------------------------------------

func TestPrintTable_JSONObject_RendersKeyValueTable(t *testing.T) {
	data := []byte(`{"name":"devtrack","version":"1.0"}`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable returned unexpected error: %v", err)
		}
	})

	if !strings.Contains(out, "name") {
		t.Error("table output should contain key 'name'")
	}
	if !strings.Contains(out, "devtrack") {
		t.Error("table output should contain value 'devtrack'")
	}
	if !strings.Contains(out, "version") {
		t.Error("table output should contain key 'version'")
	}
	if !strings.Contains(out, "1.0") {
		t.Error("table output should contain value '1.0'")
	}
	// Key-value tables should have "KEY" and "VALUE" headers.
	upperOut := strings.ToUpper(out)
	if !strings.Contains(upperOut, "KEY") {
		t.Error("key-value table should have a KEY header")
	}
	if !strings.Contains(upperOut, "VALUE") {
		t.Error("key-value table should have a VALUE header")
	}
}

func TestPrintTable_JSONObject_KeysSortedAlphabetically(t *testing.T) {
	// Provide keys out of alphabetical order to confirm they are sorted.
	data := []byte(`{"z_last":"last","a_first":"first","m_middle":"middle"}`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable returned unexpected error: %v", err)
		}
	})

	idxFirst := strings.Index(out, "a_first")
	idxMiddle := strings.Index(out, "m_middle")
	idxLast := strings.Index(out, "z_last")

	if idxFirst < 0 || idxMiddle < 0 || idxLast < 0 {
		t.Fatal("one or more keys not found in output")
	}
	if !(idxFirst < idxMiddle && idxMiddle < idxLast) {
		t.Error("keys are not rendered in alphabetical order")
	}
}

// ---------------------------------------------------------------------------
// PrintTable — JSON array of objects (multi-row table)
// ---------------------------------------------------------------------------

func TestPrintTable_JSONArray_RendersColumnarTable(t *testing.T) {
	data := []byte(`[{"id":1,"name":"alice"},{"id":2,"name":"bob"}]`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable returned unexpected error: %v", err)
		}
	})

	// Headers derived from the first element.
	upperOut := strings.ToUpper(out)
	if !strings.Contains(upperOut, "ID") {
		t.Error("columnar table should contain header 'ID'")
	}
	if !strings.Contains(upperOut, "NAME") {
		t.Error("columnar table should contain header 'NAME'")
	}
	// Row values.
	if !strings.Contains(out, "alice") {
		t.Error("table should contain row value 'alice'")
	}
	if !strings.Contains(out, "bob") {
		t.Error("table should contain row value 'bob'")
	}
}

func TestPrintTable_JSONArray_EmptyArray_PrintsNoResults(t *testing.T) {
	data := []byte(`[]`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable returned unexpected error: %v", err)
		}
	})

	if !strings.Contains(out, "no results") {
		t.Errorf("empty array should print '(no results)', got: %q", out)
	}
}

func TestPrintTable_JSONArray_NonObjectElements_FallsBackToJSON(t *testing.T) {
	// Array of scalars is not a table; should fall back to pretty JSON.
	data := []byte(`["one","two","three"]`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable returned unexpected error: %v", err)
		}
	})

	if !strings.Contains(out, "one") || !strings.Contains(out, "two") {
		t.Error("fallback output should still contain the array values")
	}
}

// ---------------------------------------------------------------------------
// PrintTable — invalid JSON (error / raw fallback)
// ---------------------------------------------------------------------------

func TestPrintTable_InvalidJSON_PrintsRaw(t *testing.T) {
	data := []byte(`not valid json at all`)

	out := captureStdout(t, func() {
		// PrintTable falls back to printing raw bytes on unmarshal failure.
		_ = PrintTable(data, true)
	})

	if !strings.Contains(out, "not valid json") {
		t.Errorf("invalid JSON should be printed raw, got: %q", out)
	}
}

// ---------------------------------------------------------------------------
// PrintTable — empty / null JSON
// ---------------------------------------------------------------------------

func TestPrintTable_NullJSON_PrintsRaw(t *testing.T) {
	data := []byte(`null`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable returned unexpected error: %v", err)
		}
	})

	// `null` decodes to nil interface{} — hits the default branch which
	// prints the raw bytes.
	if !strings.Contains(out, "null") {
		t.Errorf("null JSON should produce 'null' in output, got: %q", out)
	}
}

func TestPrintTable_EmptyInput_PrintsRaw(t *testing.T) {
	data := []byte(``)

	// Empty input is invalid JSON; the function should not panic and should
	// print the raw (empty) input.
	out := captureStdout(t, func() {
		_ = PrintTable(data, true)
	})

	// Output may be empty or just a newline — the important thing is no panic.
	_ = out
}

// ---------------------------------------------------------------------------
// PrintTable — color stripping when noColor is true
// ---------------------------------------------------------------------------

func TestPrintTable_NoColor_SetsTableBorder(t *testing.T) {
	// When noColor is true the table is rendered with a border (which means
	// the output contains '+' and '|' ASCII characters instead of ANSI codes).
	data := []byte(`{"key":"value"}`)

	outNoColor := captureStdout(t, func() {
		if err := PrintTable(data, true); err != nil {
			t.Errorf("PrintTable(noColor=true) returned error: %v", err)
		}
	})

	// ASCII border characters are present when noColor is true.
	if !strings.Contains(outNoColor, "+") {
		t.Error("noColor table should contain '+' border characters")
	}
	if !strings.Contains(outNoColor, "|") {
		t.Error("noColor table should contain '|' border characters")
	}
}

func TestPrintTable_NoColorFalse_StillRendersData(t *testing.T) {
	// When noColor is false the table renderer may emit ANSI codes, but the
	// actual data values must still be present.
	data := []byte(`{"project":"devtrack"}`)

	out := captureStdout(t, func() {
		if err := PrintTable(data, false); err != nil {
			t.Errorf("PrintTable(noColor=false) returned error: %v", err)
		}
	})

	if !strings.Contains(out, "project") {
		t.Error("table with noColor=false should still render key 'project'")
	}
	if !strings.Contains(out, "devtrack") {
		t.Error("table with noColor=false should still render value 'devtrack'")
	}
}
