import { parseScopes, scopesFor } from './scopes';

describe('OAuth scopes per resource', () => {
  it('defaults to every scope of the resource', () => {
    expect(parseScopes(undefined, 'MCP')).toEqual(['read', 'write']);
    expect(parseScopes('', 'ACTIVITY_IMPORT')).toEqual(['activities:import']);
  });

  it("refuses another resource's scope, ignores unknown ones", () => {
    expect(parseScopes('read activities:import', 'MCP')).toBeNull();
    expect(parseScopes('write', 'ACTIVITY_IMPORT')).toBeNull();
    expect(
      parseScopes('activities:import offline_access', 'ACTIVITY_IMPORT'),
    ).toEqual(['activities:import']);
    expect(parseScopes('offline_access', 'ACTIVITY_IMPORT')).toBeNull();
  });

  it("keeps the grant's scopes that apply to a resource", () => {
    const grant = ['read', 'activities:import'];
    expect(scopesFor(grant, 'MCP')).toEqual(['read']);
    expect(scopesFor(grant, 'ACTIVITY_IMPORT')).toEqual(['activities:import']);
  });
});
