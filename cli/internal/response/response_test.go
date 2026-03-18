package response_test

import (
	"encoding/json"
	"testing"

	"devtrack/internal/response"
)

// item is a minimal struct used as the unmarshal target in all tests.
type item struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ---------------------------------------------------------------------------
// Wrapped {"data": [...]} responses
// ---------------------------------------------------------------------------

func TestUnmarshalPaginated_WrappedArray(t *testing.T) {
	data := []byte(`{"data": [{"id": "1", "name": "alpha"}, {"id": "2", "name": "beta"}], "pagination": {"total": 2}}`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("UnmarshalPaginated returned unexpected error: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	if got[0].ID != "1" || got[0].Name != "alpha" {
		t.Errorf("got[0] = %+v, want {ID:1, Name:alpha}", got[0])
	}
	if got[1].ID != "2" || got[1].Name != "beta" {
		t.Errorf("got[1] = %+v, want {ID:2, Name:beta}", got[1])
	}
}

func TestUnmarshalPaginated_WrappedEmptyArray(t *testing.T) {
	data := []byte(`{"data": [], "pagination": {"total": 0}}`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("UnmarshalPaginated returned unexpected error: %v", err)
	}

	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}

func TestUnmarshalPaginated_WrappedNullData(t *testing.T) {
	// data key is present but null — should unmarshal to nil slice without error.
	data := []byte(`{"data": null}`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("UnmarshalPaginated returned unexpected error: %v", err)
	}

	if got != nil {
		t.Errorf("got = %v, want nil slice", got)
	}
}

// ---------------------------------------------------------------------------
// Direct top-level array responses (fallback path)
// ---------------------------------------------------------------------------

func TestUnmarshalPaginated_DirectArray(t *testing.T) {
	data := []byte(`[{"id": "10", "name": "gamma"}, {"id": "20", "name": "delta"}]`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("UnmarshalPaginated returned unexpected error: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	if got[0].ID != "10" || got[0].Name != "gamma" {
		t.Errorf("got[0] = %+v, want {ID:10, Name:gamma}", got[0])
	}
}

func TestUnmarshalPaginated_DirectEmptyArray(t *testing.T) {
	data := []byte(`[]`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("UnmarshalPaginated returned unexpected error: %v", err)
	}

	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}

// ---------------------------------------------------------------------------
// Empty / null response bodies
// ---------------------------------------------------------------------------

func TestUnmarshalPaginated_NullBody(t *testing.T) {
	// A literal JSON null — falls through to direct unmarshal which succeeds
	// with a nil target slice (json.Unmarshal([]byte("null"), &s) is valid).
	data := []byte(`null`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("UnmarshalPaginated returned unexpected error for null body: %v", err)
	}
}

func TestUnmarshalPaginated_EmptyBody(t *testing.T) {
	// Empty byte slice — should return an error (invalid JSON).
	var got []item
	if err := response.UnmarshalPaginated([]byte{}, &got); err == nil {
		t.Fatal("expected error for empty body, got nil")
	}
}

// ---------------------------------------------------------------------------
// Invalid JSON
// ---------------------------------------------------------------------------

func TestUnmarshalPaginated_InvalidJSON(t *testing.T) {
	data := []byte(`{not valid json`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestUnmarshalPaginated_InvalidDataField(t *testing.T) {
	// data key exists but its value isn't a valid JSON array of items.
	data := []byte(`{"data": "not-an-array"}`)

	var got []item
	err := response.UnmarshalPaginated(data, &got)
	if err == nil {
		t.Fatal("expected error when data field is not an array, got nil")
	}
}

// ---------------------------------------------------------------------------
// Round-trip: ensure pointer semantics are respected
// ---------------------------------------------------------------------------

func TestUnmarshalPaginated_PopulatesTarget(t *testing.T) {
	data := []byte(`{"data": [{"id": "99", "name": "omega"}]}`)

	var got []item
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the target variable was actually populated (not just local scope).
	if len(got) != 1 || got[0].ID != "99" {
		t.Errorf("target not populated correctly: got %+v", got)
	}
}

// ---------------------------------------------------------------------------
// Compatibility: works with json.RawMessage target
// ---------------------------------------------------------------------------

func TestUnmarshalPaginated_RawMessageTarget(t *testing.T) {
	data := []byte(`{"data": [{"id": "raw-1"}]}`)

	var got []json.RawMessage
	if err := response.UnmarshalPaginated(data, &got); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}
}
