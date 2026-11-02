// Coarse device heuristics for default quality / grass budget.
// Touch laptops with a fine pointer stay on the desktop path; phones
// and tablets (coarse pointer + narrow viewport) get the lighter tier.

export function isCoarseMobileDevice(): boolean
{
	try
	{
		return window.matchMedia('(pointer: coarse)').matches
			&& window.matchMedia('(max-width: 1024px)').matches;
	}
	catch (_e)
	{
		return false;
	}
}

export function preferredGrassInstances(): number
{
	return isCoarseMobileDevice() ? 80000 : 300000;
}
