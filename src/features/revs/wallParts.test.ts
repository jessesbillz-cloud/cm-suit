import { describe, expect, it } from 'vitest';
import { PART_LABELS, WALL_PARTS, partOf } from './wallParts';

describe('partOf', () => {
  // A fire marshal job's legend (synthetic): every item lands on its part of the wall.
  const legend: [item: string, rev: string, part: string][] = [
    ['TOW - Speed Plugs', 'TOW', 'deck_flutes'],
    ['HOW Cavity Stuff', 'HOW - Cavity', 'head_of_wall_cavity'],
    ['HOW Cavity Spray', 'HOW - Cavity', 'head_of_wall_cavity'],
    ['HOW Beam Pockets', 'HOW - Cavity', 'beam_pockets'],
    ['CJ Stuffing', 'CJ', 'control_joint'],
    ['CJ Caulking', 'CJ', 'control_joint'],
    ['First Side - First Layer', 'Drywall', 'board_s1_l1'],
    ['First Side - Second Layer', 'Drywall', 'board_s1_l2'],
    ['First Side - Fire Tape', 'Drywall', 'board_s1_tape'],
    ['Second Side - First Layer', 'Drywall', 'board_s2_l1'],
    ['Second Side - Second Layer', 'Drywall', 'board_s2_l2'],
    ['Second Side - Fire Tape', 'Drywall', 'board_s2_tape'],
    ['In-Wall Electrical', 'In-Wall', 'in_wall_electrical'],
    ['In-Wall Plumbing', 'In-Wall', 'in_wall_plumbing'],
    ['In-Wall HVAC Controls', 'In-Wall', 'in_wall_hvac'],
    ['In-Wall Mechanical', 'In-Wall', 'in_wall_mechanical'],
    ['In-Wall Final - OK to Cover - Slab firestopping/putty pads', 'In-Wall Final', 'slab_firestop'],
    ['HOW Surface Stuff', 'HOW - Surface', 'head_of_wall_surface'],
    ['HOW Surface Spray', 'HOW - Surface', 'head_of_wall_surface'],
    ['BOX Caulking', 'HOW - Surface', 'box'],
    ['Final - OK to Cover - All firestopping/fireproofing', 'Final', 'whole_wall'],
  ];

  it('places every item of the legend', () => {
    for (const [item, rev, part] of legend) expect(`${item}: ${partOf(item, rev)}`).toBe(`${item}: ${part}`);
  });

  it("reads the rev's name when the item alone says too little", () => {
    expect(partOf('Stuff', 'HOW - Surface')).toBe('head_of_wall_surface');
    expect(partOf('Spray', 'HOW - Cavity')).toBe('head_of_wall_cavity');
    expect(partOf('Electrical', 'In-Wall')).toBe('in_wall_electrical');
  });

  it('knows other ways of writing the same parts', () => {
    expect(partOf('Full Height Drywall 1st Layer', 'Drywall')).toBe('board_s1_l1');
    expect(partOf('Side 2 layer 2', 'Board')).toBe('board_s2_l2');
    // The item's own words win over its rev's.
    expect(partOf('Intumescent Strip at Top & Bottom Track', 'TOW')).toBe('top_track');
    expect(partOf('Intumescent strip at bottom track', 'Tracks')).toBe('bottom_track');
    expect(partOf('Deflection track', 'Framing')).toBe('top_track');
    expect(partOf('Shaftwall Framing', 'Frame')).toBe('studs');
    expect(partOf('Cavity Stuffing', 'Liner')).toBe('head_of_wall_cavity');
    expect(partOf('Sound batts', 'Insulation')).toBe('cavity');
    expect(partOf('Control joints', 'Joints')).toBe('control_joint');
    expect(partOf('Electrical boxes - putty pads', 'Boxes')).toBe('slab_firestop');
  });

  it('is the whole wall when nothing names a part', () => {
    expect(partOf('Sample walkthrough', 'Misc')).toBe('whole_wall');
    expect(partOf('', '')).toBe('whole_wall');
  });

  it('does not read a part inside another word', () => {
    expect(partOf('Towel bars', 'Accessories')).toBe('whole_wall');
    expect(partOf('Showroom', 'Misc')).toBe('whole_wall');
  });
});

describe('PART_LABELS', () => {
  it('names every part once', () => {
    expect(Object.keys(PART_LABELS).sort()).toEqual([...WALL_PARTS].sort());
    expect(new Set(Object.values(PART_LABELS)).size).toBe(WALL_PARTS.length);
  });
});
