const RED = "#FF0000";
const ORANGE = "#FF9800";
const GREEN = "#4CAF50";
const BLUE = "#2196F3";
const GREY = "#9E9E9E";
const WHITE = "#FFFFFF";
const PURPLE = "#8000FF";

const TEXT_FONT_SIZE = 60;
const TEXT_LINE_HEIGHT = 70;

const NODE_SIZE = 200;
const LEAF_HEIGHT = 100;
const LEAF_WIDTH = 400;

// Status color mapping
const statusColors = {
  ready: GREEN,
  soon: ORANGE,
  "not started": RED,
  notstarted: RED,
  wontdo: PURPLE,

  default: GREY,
};

const visibilityColors = {
  public: BLUE,
  internal: GREY,
};

// Transform hierarchical data into D3 hierarchy
function transformData(data) {
  function createHierarchy(item) {
    // Skip items without a name
    if (!item || !item.name) {
      console.warn("Skipping item without name:", item);
      return null;
    }

    const node = {
      name: item.name,
      status: item.status || null,
      link: item.links || item.link || null,
      category: item.category || null,
      side: item.side || null,
      visibility: item.visibility || null,
      children: [],
    };

    if (item.items && Array.isArray(item.items)) {
      node.children = item.items
        .map((child) => createHierarchy(child))
        .filter((child) => child !== null);
    }

    if (node.children.length === 0) {
      delete node.children;
    }

    return node;
  }

  // Handle the roadmap structure
  if (Array.isArray(data)) {
    // New format: array at root level - create artificial root
    if (data.length === 1) {
      return createHierarchy(data[0]);
    } else {
      return {
        name: "Root",
        children: data
          .map((item) => createHierarchy(item))
          .filter((item) => item !== null),
      };
    }
  } else {
    // Single root object
    return createHierarchy(data);
  }
}

// Initialize the D3.js visualization
function initVisualization(data, config = {}) {
  // Default configuration
  const defaultConfig = {
    nodeSpacingVertical: 200,
    nodeSpacingHorizontal: 1000,
    nodeScale: 1.2,
    textScale: 1.3,
    edgeWidth: 10,
    staggerOffset: 0.2,
    hideLeaves: false,
    colorMode: "status", // 'status' or 'visibility'
  };

  // Note: Node sizes automatically scale based on depth using exponential decay
  // Each level is 85% the size of the previous level (Math.pow(0.85, depth))
  // This creates a smooth visual hierarchy where root nodes are largest

  // Merge with provided config
  const settings = { ...defaultConfig, ...config };

  const width = window.innerWidth;
  const height = window.innerHeight;

  // Transform the data into hierarchy
  const hierarchyData = transformData(data);
  console.log("Hierarchy data:", hierarchyData);

  // Create D3 hierarchy
  const root = d3.hierarchy(hierarchyData);

  console.log("Total nodes:", root.descendants().length);

  // Create SVG
  const svg = d3
    .select("#visualization")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Add zoom behavior
  const g = svg.append("g");

  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Function to wrap text into multiple lines
  function wrapText(text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + " " + words[i];
      const testLength = (testLine.length * TEXT_FONT_SIZE) / 2; // Approximate width per character

      if (testLength > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  // Set node sizes based on depth (and text content for leaves)
  root.descendants().forEach((d) => {
    const isLeaf = !d.children;

    // Calculate depth-based scale: each level is 85% of the previous
    // This creates a smooth exponential decay that's not too steep
    const depthScale = Math.pow(0.85, d.depth);
    d.depthScale = depthScale; // Store for later use

    if (isLeaf) {
      // Rectangular leaf nodes - calculate height based on text content
      d.nodeWidth = LEAF_WIDTH * settings.nodeScale * depthScale;

      // Calculate how many lines of text we'll need using the actual wrapText function
      const lineHeight = TEXT_LINE_HEIGHT * settings.textScale * depthScale;
      const padding = 20 * depthScale;
      const maxTextWidth = d.nodeWidth - padding * 2;

      // Use wrapText to get the exact number of lines
      const lines = wrapText(d.data.name || "", maxTextWidth);
      const numLines = lines.length;

      // Calculate required height based on actual number of lines with padding
      const minHeight = LEAF_HEIGHT * settings.nodeScale * depthScale;
      const textHeight = numLines * lineHeight + padding * 2;
      d.nodeHeight = Math.max(minHeight, textHeight);
    } else {
      // Circular parent nodes with fixed radius
      const radius = NODE_SIZE * settings.nodeScale * depthScale;
      d.nodeWidth = radius * 2;
      d.nodeHeight = radius * 2;
    }
  });

  // Create tree layout (horizontal) with direct pixel spacing control
  const baseVerticalSpacing = settings.nodeSpacingVertical;
  const baseHorizontalSpacing = settings.nodeSpacingHorizontal;

  const treeLayout = d3
    .tree()
    .nodeSize([baseVerticalSpacing, baseHorizontalSpacing])
    .separation((a, b) => {
      // Return a direct factor - the baseVerticalSpacing is multiplied by this
      // So returning 1.0 means nodes are exactly baseVerticalSpacing apart

      if (a.parent === b.parent) {
        // Check if both nodes are leaves (meaning parent only has leaves)
        const aIsLeaf = !a.children;
        const bIsLeaf = !b.children;

        if (aIsLeaf && bIsLeaf) {
          // Both are leaves - space them closer (halfway)
          return 0.5;
        }

        // Siblings but not both leaves
        return 0.8;
      }

      // Different parents
      return 1.2;
    });

  // Propagate category, side, and visibility information to all descendants BEFORE layout
  root.descendants().forEach((d) => {
    if (!d.data.category && d.parent) {
      // Inherit category from parent
      let ancestor = d.parent;
      while (ancestor && !ancestor.data.category) {
        ancestor = ancestor.parent;
      }
      if (ancestor && ancestor.data.category) {
        d.inheritedCategory = ancestor.data.category;
      }
    } else if (d.data.category) {
      d.inheritedCategory = d.data.category;
    }

    // Inherit side information
    if (!d.data.side && d.parent) {
      // Inherit side from parent
      let ancestor = d.parent;
      while (ancestor && !ancestor.data.side) {
        ancestor = ancestor.parent;
      }
      if (ancestor && ancestor.data.side) {
        d.inheritedSide = ancestor.data.side;
      }
    } else if (d.data.side) {
      d.inheritedSide = d.data.side;
    }

    // Inherit visibility information
    if (!d.data.visibility && d.parent) {
      // Inherit visibility from parent
      let ancestor = d.parent;
      while (ancestor && !ancestor.data.visibility) {
        ancestor = ancestor.parent;
      }
      if (ancestor && ancestor.data.visibility) {
        d.inheritedVisibility = ancestor.data.visibility;
      }
    } else if (d.data.visibility) {
      d.inheritedVisibility = d.data.visibility;
    }
  });

  // Function to determine if a node belongs to left or right side
  function getNodeSide(node) {
    const side = node.inheritedSide || node.data.side;
    // Default to right if no side is specified
    return side === "left" ? "left" : "right";
  }

  // Apply the tree layout
  treeLayout(root);

  // Swap x and y for horizontal layout
  root.descendants().forEach((d) => {
    const temp = d.x;
    d.x = d.y;
    d.y = temp;
  });

  // Store the original x position (distance from root) for each node
  root.descendants().forEach((d) => {
    d.originalX = d.x;
  });

  // Reverse x coordinates for left-side categories
  // For left side, we want the tree to grow leftward (negative x direction)
  root.descendants().forEach((d) => {
    const side = getNodeSide(d);
    if (side === "left") {
      // Invert x coordinate so it grows left instead of right
      d.x = -d.originalX;
    }
  });

  // Arrange leaf nodes closer to parent and in double columns if needed
  root.descendants().forEach((d) => {
    if (d.children && d.children.length > 0) {
      // Check if all children are leaves
      const allChildrenAreLeaves = d.children.every((child) => !child.children);

      if (allChildrenAreLeaves) {
        const numChildren = d.children.length;
        const side = getNodeSide(d);
        const direction = side === "left" ? -1 : 1;

        // Move leaves closer to parent (reduce horizontal distance)
        const leafHorizontalOffset = baseHorizontalSpacing * 0.5; // 50% closer

        if (numChildren > 2) {
          // Double column layout for more than 3 children
          const columnSpacing = baseHorizontalSpacing * 0.3; // Spacing between columns
          const rowSpacing = baseVerticalSpacing * 1.2; // Vertical spacing between rows

          d.children.forEach((child, index) => {
            const column = index % 2; // 0 for left column, 1 for right column
            const row = Math.floor(index / 2);

            // Calculate center Y position of all children
            const totalRows = Math.ceil(numChildren / 2);
            const totalHeight = (totalRows - 1) * rowSpacing;
            const startY = d.y - totalHeight / 2;

            // Position in grid
            child.y = startY + row * rowSpacing;
            child.x =
              d.x +
              leafHorizontalOffset * direction +
              (column === 0 ? -columnSpacing / 2 : columnSpacing / 2);
          });
        } else {
          // Single column layout for 3 or fewer children
          d.children.forEach((child, index) => {
            // Move closer to parent horizontally
            child.x = d.x + leafHorizontalOffset * direction;
            // Keep vertical spacing from tree layout (already positioned)
          });
        }
      }
    }
  });

  // Group nodes by category and calculate bounding boxes
  const nodes = root.descendants();
  const categoryGroups = {};
  nodes.forEach((d) => {
    const category = d.inheritedCategory;
    if (category) {
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(d);
    }
  });

  // Helper function to calculate bounding box for a category
  function calculateCategoryBounds(categoryNodes, padding) {
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    categoryNodes.forEach((d) => {
      const halfWidth = d.nodeWidth / 2;
      const halfHeight = d.nodeHeight / 2;

      minX = Math.min(minX, d.x - halfWidth);
      maxX = Math.max(maxX, d.x + halfWidth);
      minY = Math.min(minY, d.y - halfHeight);
      maxY = Math.max(maxY, d.y + halfHeight);
    });

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
  }

  // Calculate initial bounding boxes for each category
  const categoryPadding = 150; // Padding around the bounding box
  const categorySpacing = 300; // Vertical spacing between category boxes

  // Sort categories by their average Y position and group by side
  const categories = Object.keys(categoryGroups);
  const categoryData = categories.map((category) => {
    const avgY =
      categoryGroups[category].reduce((sum, node) => sum + node.y, 0) /
      categoryGroups[category].length;
    // Determine side based on first node in the category
    const side = getNodeSide(categoryGroups[category][0]);
    return {
      name: category,
      avgY: avgY,
      nodes: categoryGroups[category],
      side: side,
    };
  });

  // Group categories by side
  const leftCategories = categoryData.filter((cat) => cat.side === "left");
  const rightCategories = categoryData.filter((cat) => cat.side === "right");

  // Sort each side by Y position to maintain vertical order
  leftCategories.sort((a, b) => a.avgY - b.avgY);
  rightCategories.sort((a, b) => a.avgY - b.avgY);

  const categoryBounds = {};

  // Process left-side categories
  let leftCumulativeOffset = 0;
  leftCategories.forEach((catData, index) => {
    // Calculate initial bounds
    let bounds = calculateCategoryBounds(catData.nodes, categoryPadding);

    // Apply cumulative offset to separate from previous categories on the same side
    if (index > 0) {
      const prevBounds = categoryBounds[leftCategories[index - 1].name];
      const prevBottom = prevBounds.y + prevBounds.height;
      const currentTop = bounds.y + leftCumulativeOffset;

      // If there's still overlap, add more offset
      if (currentTop < prevBottom + categorySpacing) {
        const additionalOffset = prevBottom + categorySpacing - currentTop;
        leftCumulativeOffset += additionalOffset;
      }
    }

    // Shift all nodes in this category
    if (leftCumulativeOffset !== 0) {
      catData.nodes.forEach((node) => {
        node.y += leftCumulativeOffset;
      });

      // Recalculate bounds after shifting
      bounds = calculateCategoryBounds(catData.nodes, categoryPadding);
    }

    categoryBounds[catData.name] = bounds;
  });

  // Process right-side categories
  let rightCumulativeOffset = 0;
  rightCategories.forEach((catData, index) => {
    // Calculate initial bounds
    let bounds = calculateCategoryBounds(catData.nodes, categoryPadding);

    // Apply cumulative offset to separate from previous categories on the same side
    if (index > 0) {
      const prevBounds = categoryBounds[rightCategories[index - 1].name];
      const prevBottom = prevBounds.y + prevBounds.height;
      const currentTop = bounds.y + rightCumulativeOffset;

      // If there's still overlap, add more offset
      if (currentTop < prevBottom + categorySpacing) {
        const additionalOffset = prevBottom + categorySpacing - currentTop;
        rightCumulativeOffset += additionalOffset;
      }
    }

    // Shift all nodes in this category
    if (rightCumulativeOffset !== 0) {
      catData.nodes.forEach((node) => {
        node.y += rightCumulativeOffset;
      });

      // Recalculate bounds after shifting
      bounds = calculateCategoryBounds(catData.nodes, categoryPadding);
    }

    categoryBounds[catData.name] = bounds;
  });

  // Center the root node vertically relative to all categories
  if (root && Object.keys(categoryBounds).length > 0) {
    // Find the vertical center of all categories
    const allCategoryNodes = Object.values(categoryBounds);
    const minCategoryY = Math.min(...allCategoryNodes.map((b) => b.y));
    const maxCategoryY = Math.max(
      ...allCategoryNodes.map((b) => b.y + b.height),
    );
    const categoriesVerticalCenter = (minCategoryY + maxCategoryY) / 2;

    // Calculate the offset needed to align root with categories center
    const rootYOffset = categoriesVerticalCenter - root.y;

    // Apply offset to all nodes
    root.descendants().forEach((d) => {
      d.y += rootYOffset;
    });

    // Recalculate and update category bounds after shifting
    Object.entries(categoryBounds).forEach(([name, bounds]) => {
      bounds.y += rootYOffset;
    });
  }

  // Now apply viewport centering AFTER all category adjustments
  let xExtent = d3.extent(nodes, (d) => d.x);
  let yExtent = d3.extent(nodes, (d) => d.y);

  // Add padding
  const padding = 100;
  const treeWidth = xExtent[1] - xExtent[0] + padding * 2;
  const treeHeight = yExtent[1] - yExtent[0] + padding * 2;

  // Calculate scale to fit the tree in the viewport
  const scale = Math.min(
    1,
    Math.min(width / treeWidth, height / treeHeight) * 0.9,
  );

  // Center the tree in viewport
  const xOffset = (width / scale - (xExtent[1] - xExtent[0])) / 2 - xExtent[0];
  const yOffset = (height / scale - (yExtent[1] - yExtent[0])) / 2 - yExtent[0];

  nodes.forEach((d) => {
    d.x += xOffset;
    d.y += yOffset;
  });

  // Update category bounds with viewport offsets
  Object.entries(categoryBounds).forEach(([name, bounds]) => {
    bounds.x += xOffset;
    bounds.y += yOffset;
  });

  // Apply initial zoom
  if (scale < 1) {
    svg.call(zoom.transform, d3.zoomIdentity.scale(scale));
  }

  // Store the initial transform for zooming back out
  const initialTransform = d3.zoomTransform(svg.node());

  // Track which category is currently zoomed in (null means global view)
  let zoomedCategory = null;

  // Draw category rectangles
  const categoryRects = g
    .append("g")
    .attr("class", "category-containers")
    .selectAll("g")
    .data(Object.entries(categoryBounds))
    .join("g")
    .attr("class", "category-container");

  categoryRects
    .append("rect")
    .attr("x", (d) => d[1].x)
    .attr("y", (d) => d[1].y)
    .attr("width", (d) => d[1].width)
    .attr("height", (d) => d[1].height)
    .attr("fill", "#808080")
    .attr("fill-opacity", 0.15)
    .attr("stroke", "#666666")
    .attr("stroke-width", 3)
    .attr("rx", 10)
    .attr("ry", 10)
    .style("cursor", "pointer")
    .on("click", function (event, d) {
      event.stopPropagation();

      const categoryName = d[0];

      // Check if we're already zoomed into this category
      if (zoomedCategory === categoryName) {
        // Zoom back out to global view
        svg.transition().duration(750).call(zoom.transform, initialTransform);

        zoomedCategory = null;
      } else {
        // Zoom into this category
        const bounds = d[1];

        // Calculate center point of the category
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;

        // Calculate the scale needed to fit the category with 30px margin
        const margin = 30;
        const availableWidth = width - 2 * margin;
        const availableHeight = height - 2 * margin;

        // Calculate scale based on which dimension is the limiting factor
        const scaleX = availableWidth / bounds.width;
        const scaleY = availableHeight / bounds.height;
        const targetScale = Math.min(scaleX, scaleY);

        // Calculate the translation needed to center the category
        // The formula accounts for the scale transformation
        const translateX = width / 2 - centerX * targetScale;
        const translateY = height / 2 - centerY * targetScale;

        // Animate the zoom transform
        svg
          .transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity
              .translate(translateX, translateY)
              .scale(targetScale),
          );

        zoomedCategory = categoryName;
      }
    });

  // Add category titles
  categoryRects
    .append("text")
    .attr("x", (d) => d[1].x + 20)
    .attr("y", (d) => d[1].y + 60)
    .style("font-size", "50px")
    .style("font-weight", "bold")
    .style("fill", "#CCCCCC")
    .style("text-transform", "capitalize")
    .text((d) => d[0]);

  // Filter nodes and links based on hideLeaves setting
  const visibleNodes = settings.hideLeaves
    ? root.descendants().filter((d) => d.children)
    : root.descendants();

  const visibleLinks = settings.hideLeaves
    ? root.links().filter((d) => d.target.children)
    : root.links();

  // Create links (horizontal)
  const link = g
    .append("g")
    .selectAll("path")
    .data(visibleLinks)
    .join("path")
    .attr("class", "link")
    .attr("stroke-width", settings.edgeWidth)
    .attr(
      "d",
      d3
        .linkHorizontal()
        .x((d) => d.x)
        .y((d) => d.y),
    );

  // Create nodes
  const node = g
    .append("g")
    .selectAll("g")
    .data(visibleNodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  // Render nodes with fixed sizes, wrapping text to fit
  node.each(function (d) {
    const isLeaf = !d.children;
    const depthScale = d.depthScale; // Use pre-calculated depth scale

    const fontSize = TEXT_FONT_SIZE * settings.textScale * depthScale;
    const lineHeight = TEXT_LINE_HEIGHT * settings.textScale * depthScale;

    // Determine color based on colorMode
    let color = statusColors["default"];
    if (settings.colorMode === "visibility") {
      // Use visibility for color
      const visibility = d.inheritedVisibility || d.data.visibility;
      if (visibility) {
        color =
          visibilityColors[visibility.toLowerCase()] ||
          visibilityColors["internal"];
      } else {
        color = visibilityColors["internal"]; // Default to internal if no visibility is set
      }
    } else {
      // Use status for color (default)
      if (d.data.status) {
        color =
          statusColors[d.data.status.toLowerCase()] || statusColors["default"];
      }
    }

    const width = d.nodeWidth;
    const height = d.nodeHeight;

    // Calculate max text width based on fixed node size (with padding)
    const padding = 20 * depthScale;
    const maxTextWidth = width - padding * 2;

    // Calculate text lines - always wrap to fit the fixed width
    const tempText = d3
      .select(this)
      .append("text")
      .attr("text-anchor", "middle")
      .style("font-size", fontSize + "px")
      .style("font-weight", "600")
      .text(d.data.name || "");

    const textLength = tempText.node().getComputedTextLength();
    let lines = [d.data.name];

    // Wrap text if it exceeds the max width
    if (textLength > maxTextWidth) {
      lines = wrapText(d.data.name, maxTextWidth);
    }

    // Render the node shape (fixed size)
    if (isLeaf) {
      d3.select(this)
        .insert("rect", "text")
        .attr("width", width)
        .attr("height", height)
        .attr("x", -width / 2)
        .attr("y", -height / 2)
        .attr("rx", 5 * depthScale)
        .attr("ry", 5 * depthScale)
        .attr("fill", color);
    } else {
      const radius = width / 2;
      d3.select(this)
        .insert("circle", "text")
        .attr("r", radius)
        .attr("fill", color);
    }

    // Remove temporary text
    tempText.remove();

    // Add wrapped text
    const textGroup = d3.select(this);
    const startY = (-(lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      textGroup
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", startY + i * lineHeight)
        .style("font-size", fontSize + "px")
        .style("font-weight", "800")
        .style("pointer-events", "none")
        .style("fill", d.data.link ? BLUE : WHITE)
        .style("text-decoration", d.data.link ? "underline" : "none")
        .text(line);
    });
  });

  // Add click handler for nodes with links
  node.on("click", (event, d) => {
    if (d.data.link) {
      window.open(d.data.link, "_blank");
    }
  });

  // Update cursor style for clickable nodes
  node.style("cursor", (d) => (d.data.link ? "pointer" : "default"));

  // Add hover effect to scale nodes 2x
  node
    .on("mouseenter", function (event, d) {
      const nodeGroup = d3.select(this);

      // Store original transform for restoration
      const currentTransform = nodeGroup.attr("transform");
      nodeGroup.attr("data-original-transform", currentTransform);

      // Scale all shapes within the node
      nodeGroup
        .selectAll("circle")
        .transition()
        .duration(200)
        .attr("r", function () {
          const originalR = parseFloat(d3.select(this).attr("r"));
          d3.select(this).attr("data-original-r", originalR);
          return originalR * 2;
        });

      nodeGroup
        .selectAll("rect")
        .transition()
        .duration(200)
        .attr("width", function () {
          const originalW = parseFloat(d3.select(this).attr("width"));
          d3.select(this).attr("data-original-width", originalW);
          return originalW * 2;
        })
        .attr("height", function () {
          const originalH = parseFloat(d3.select(this).attr("height"));
          d3.select(this).attr("data-original-height", originalH);
          return originalH * 2;
        })
        .attr("x", function () {
          const originalX = parseFloat(d3.select(this).attr("x"));
          d3.select(this).attr("data-original-x", originalX);
          return originalX * 2;
        })
        .attr("y", function () {
          const originalY = parseFloat(d3.select(this).attr("y"));
          d3.select(this).attr("data-original-y", originalY);
          return originalY * 2;
        });

      // Scale all text within the node
      nodeGroup
        .selectAll("text")
        .transition()
        .duration(200)
        .style("font-size", function () {
          const currentSize = d3.select(this).style("font-size");
          const numericSize = parseFloat(currentSize);
          d3.select(this).attr("data-original-font-size", numericSize);
          return numericSize * 2 + "px";
        })
        .attr("dy", function () {
          const originalDy = d3.select(this).attr("dy");
          d3.select(this).attr("data-original-dy", originalDy);
          return parseFloat(originalDy) * 2;
        });

      // Bring node to front
      nodeGroup.raise();
    })
    .on("mouseleave", function (event, d) {
      const nodeGroup = d3.select(this);

      // Restore all shapes to original size
      nodeGroup
        .selectAll("circle")
        .transition()
        .duration(200)
        .attr("r", function () {
          return parseFloat(d3.select(this).attr("data-original-r"));
        });

      nodeGroup
        .selectAll("rect")
        .transition()
        .duration(200)
        .attr("width", function () {
          return parseFloat(d3.select(this).attr("data-original-width"));
        })
        .attr("height", function () {
          return parseFloat(d3.select(this).attr("data-original-height"));
        })
        .attr("x", function () {
          return parseFloat(d3.select(this).attr("data-original-x"));
        })
        .attr("y", function () {
          return parseFloat(d3.select(this).attr("data-original-y"));
        });

      // Restore all text to original size
      nodeGroup
        .selectAll("text")
        .transition()
        .duration(200)
        .style("font-size", function () {
          return d3.select(this).attr("data-original-font-size") + "px";
        })
        .attr("dy", function () {
          return parseFloat(d3.select(this).attr("data-original-dy"));
        });
    });
}
