package response

import "encoding/json"

// UnmarshalPaginated tries to extract data from a {"data": [...]} wrapper,
// falling back to direct unmarshal if the response isn't wrapped.
//
// It handles two common API response shapes:
//
//	Paginated envelope: {"data": [...], "pagination": {...}}
//	Direct array:       [...]
//
// target must be a pointer (typically *[]T) that json.Unmarshal can write into.
func UnmarshalPaginated(data []byte, target interface{}) error {
	// First attempt: treat the response as an object and look for a "data" key.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err == nil {
		if dataRaw, ok := raw["data"]; ok {
			return json.Unmarshal(dataRaw, target)
		}
	}

	// Fallback: unmarshal the top-level value directly (e.g. a bare array).
	return json.Unmarshal(data, target)
}
