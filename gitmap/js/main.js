var theApp = (function() {
  var outerSVG = d3.select("#treemap");
  var isNarrow = outerSVG.node().getBoundingClientRect().width < 500;
  outerSVG.style("height", outerSVG.style("width")); // make square
  if (isNarrow) {
    d3.select("#tooltip-text").classed("hidden", false);
    d3.select("#breadcrumb-container").classed("mobile-tooltip", true);
  }
  var repoMap = {fullDict: {}, leafList: [], leafDict: {}, edgeList: []};
  var appState = {selectedRepoID: null, selectedRepoName: "", svgStack: []};
  var $sr;

  function countChildren(node) {
    if (node.childCount) {
      // memoize
      return node.childCount;
    }
    if (!node.children) {
      return (node.childCount = 1);
    } else {
      return (node.childCount = node.children.map(countChildren).reduce(function(a,b) {return a+b;},0));
    }
  }

  function initSelectBox(rootNode) {
    $sr = $("#selected-repo");
    $sr.select2({
      theme: "classic",
      placeholder: "Type or click on the map to select a repository...",
      allowClear: true,
      minimumInputLength: 3,
      data: getAllChildren(rootNode).sort(function(a,b) {return a.text.localeCompare(b.text);})
    });
    $("#selected-repo-placeholder").addClass("hidden");
    $sr.removeClass("hidden");
    $sr.on("change", function() {
      dispatch({
        type: "SELECT_REPO",
        byName: false,
        repoID: ($sr.val() === "") ? null : parseInt($sr.val(), 10),
        pushHistoryEntry: true
      });
      if (appState.selectedRepoID !== null) {
        d3.select(".select2-selection__clear")
          .style("font-weight", "normal")
          .html("X"); // easier to click than &times;
      }
    });
    // prevent "x" from opening dropdown - code from https://github.com/select2/select2/issues/3320
    $sr.on('select2:unselecting', function(e) {
        $sr.data('unselecting', true);
    }).on('select2:open', function(e) { // note the open event is important
        if ($sr.data('unselecting')) {
            $sr.removeData('unselecting'); // you need to unset this before close
            $sr.select2('close');
        }
    });
  }

  function initApp(repoTree, edges) {
    repoMap.rootNode = repoTree;
    countChildren(repoTree);
    addBreadcrumbs(repoTree, []);
    addEdges(edges);
    createTreeMap(repoTree,1);
    initSelectBox(repoTree);
    window.addEventListener('popstate', function(e) {
      if (e.state) {
        dispatch({type: "SELECT_REPO", byName: false, repoID: e.state.repoID, pushHistoryEntry: false});
      }
    }, false);
    if (/^#!\S+\/\S+$/.test(window.location.hash)) {
      dispatch({type: "SELECT_REPO", byName: true, repoName: window.location.hash.slice(2), pushHistoryEntry: false});
    } else {
      dispatch({type: "SELECT_REPO", byName: false, repoID: null, pushHistoryEntry: false});
    }
    if (Modernizr.history) {
      history.replaceState(
        {repoID: appState.selectedRepoID},
        "Github Repository Map" + ((appState.selectedRepoID === null) ? "" : " - " + appState.selectedRepoName)
      );
    }
    d3.selectAll(".spinner").remove();
    rerender();
  }

  function tooltipText(node) {
    if (node.tooltipText) {
      // memoize
      return node.tooltipText.slice(0);
    }
    var res = (node.breadcrumbs.length === 1) ? [] : [node.name];
    if (!node.children) {
      node.tooltipText = res;
      return node.tooltipText.slice(0);
    }
    var totalChildren = countChildren(node);
    var otherChildCounts = node.children
      .filter(function(child) {return child.name != node.name;})
      .map(function(x) {return [x.name, countChildren(x)];})
      .sort(function(a, b) {return b[1] - a[1]})
      .slice(0,(node.breadcrumbs.length === 1) ? 3 : 2);
    res = res.concat(otherChildCounts.map(function(x) {return x[0];}));
    if (totalChildren > res.length) {
      res.push("...and " + (totalChildren - res.length) + " more");
    }
    node.tooltipText = res;
    return node.tooltipText.slice(0);
  }

  function getAllChildren(node) {
    if (!node.children) {
      return [{id: node.repoID, text: node.name}];
    } else {
      return node.children.map(getAllChildren).reduce(function(a,b) {return a.concat(b);}, []);
    }
  }

  function addBreadcrumbs(node, trail) {
    node.breadcrumbs = trail.concat([node.name]);
    node.sanitizedName = node.breadcrumbs.map(function(x) {return x.replace(/\W+/g,"_");}).join("-");
    repoMap.fullDict[node.breadcrumbs] = node;
    if (!node.children) {
      repoMap.leafList.push(node);
      repoMap.edgeList.push([]);
      node.repoID = repoMap.leafList.length - 1;
      repoMap.leafDict[node.name] = node;
    } else {
      node.children.forEach(function(x) {addBreadcrumbs(x,node.breadcrumbs);});
    }
  }

  function addEdges(edges) {
    edges.forEach(function(edge) {
      if (repoMap.leafDict[edge[0]] && repoMap.leafDict[edge[1]]) {
        repoMap.edgeList[repoMap.leafDict[edge[0]].repoID].push(repoMap.leafDict[edge[1]]);
        repoMap.edgeList[repoMap.leafDict[edge[1]].repoID].push(repoMap.leafDict[edge[0]]);
      }
    });
  }

  function isBreadcrumbPrefix(prefixCand, breadcrumbs) {
    return prefixCand.every(function(e,i) {
      return e === breadcrumbs[i];
    });
  }

  function dispatch(action) {
    // Redux-inspired single source of truth, but mutate the state for now
    switch(action.type) {
      case "SELECT_REPO":
        if ((action.byName && (appState.selectedRepoName === action.repoName)) ||
            (!action.byName && (appState.selectedRepoID === action.repoID))) {
            // already selected, exit
              break;
        }
        if (action.byName) {
          appState.selectedRepoName = action.repoName;
          appState.selectedRepoID = (action.repoName === "") ? null : repoMap.leafDict[action.repoName].repoID;
        } else {
          appState.selectedRepoName = (action.repoID === null) ? "" : repoMap.leafList[action.repoID].name;
          appState.selectedRepoID = action.repoID;
        }
        if (action.pushHistoryEntry && Modernizr.history) {
          // back button will not work on IE9
          history.pushState(
            {repoID: appState.selectedRepoID},
            "Github Repository Map" + ((appState.selectedRepoID === null) ? "" : " - " + appState.selectedRepoName),
            (appState.selectedRepoID === null) ? window.location.pathname : ("#!" + appState.selectedRepoName)
          );
        }
        if (appState.selectedRepoID !== null) {
          // delete the maps that aren't in the selection breadcrumbs
          appState.svgStack = [];
          d3.selectAll(".innerMap").each(function(d) {
            if (!isBreadcrumbPrefix(d.breadcrumbs, repoMap.leafList[appState.selectedRepoID].breadcrumbs)) {
              this.remove();
            } else {
              appState.svgStack.push(d.svgDescription);
            }
          });
        }
        rerender();
        break;
      case "PUSH_MAP":
        appState.svgStack.push(action.svgDescription);
        rerender();
        break;
      case "POP_MAP":
        var stackTop = appState.svgStack.pop();
        if (!action.svgDescription.every(function(e,i) {return e === stackTop[i];})) {
          console.log("Something weird happened with the stack...");
          console.log("Top of stack: ", stackTop);
          console.log("svgDescription: ", action.svgDescription);
        }
        rerender();
        break;
      default:
        throw "Unknown action";
    }
  }

  function rerender() {
    d3.selectAll(".node.selected")
      .classed("selected", false)
    d3.selectAll(".node.related")
      .classed("related", false);
    d3.select("#related-repos").selectAll(".related-repo").remove();
    d3.select("#related-repo-header").html("Select a repository to find related repos");
    d3.select("#breadcrumbs").html("Displaying: " +
      ((appState.svgStack.length > 0) ?
      appState.svgStack[appState.svgStack.length - 1].join(", ") :
      tooltipText(repoMap.rootNode).join(", "))
    );
    if (parseInt($sr.val(), 10) !== appState.selectedRepoID) { // really really slow so don't do it if we don't have to
      $sr.val(appState.selectedRepoID).trigger("change");
    }
    if (appState.selectedRepoID) {
      var repo = repoMap.leafList[appState.selectedRepoID];
      d3.select("#related-repo-header").html("Repos related to " + repo.name + ":");
      d3.selectAll(".node").filter(function(d) {
        return d.depth > 0 && isBreadcrumbPrefix(d.breadcrumbs, repo.breadcrumbs);
      }).classed("selected", true);
      d3.selectAll(".node").filter(function(d) {
        return repoMap.edgeList[appState.selectedRepoID].some(function(relatedRepo) {
          return d.depth > 0 && isBreadcrumbPrefix(d.breadcrumbs, relatedRepo.breadcrumbs);
        });
      }).classed("related", true);
      var owner = repo.name.split("/")[0], reposBySameOwner = [], reposByOtherOwner = [];
      repoMap.edgeList[appState.selectedRepoID].forEach(function(relatedRepo) {
        if (relatedRepo.name.split("/")[0] === owner) {
          reposBySameOwner.push(relatedRepo);
        } else {
          reposByOtherOwner.push(relatedRepo);
        }
      });
      d3.select("#related-repos").selectAll(".related-repo.same-owner")
        .data(reposBySameOwner.sort(function(a,b) { return a.name.localeCompare(b.name); }))
        .enter().append("p").attr("class", "related-repo same-owner");
      d3.select("#related-repos").selectAll(".related-repo.other-owner")
        .data(reposByOtherOwner.sort(function(a,b) { return a.name.localeCompare(b.name); }))
        .enter().append("p").attr("class", "related-repo other-owner");
      d3.select("#related-repos").selectAll(".related-repo")
        .append("a")
        .text(function(d) {return d.name;})
        .on("click", function(d) { dispatch({type: "SELECT_REPO", byName: false, repoID: d.repoID, pushHistoryEntry: true}); });
    }
  }

  function createTreeMap(root, level, initialLeft, initialTop, initialDiameter) {
    function showToolTip(node, svgCircle) {
      var repoInfo = tooltipText(node);
      circles.classed("outlined", false);
      highlightedSVGCircle = svgCircle.classed("outlined", true);

      if (isNarrow) {
        tooltip.html(repoInfo.join(", "));
      } else {
        tooltip.selectAll("tspan").remove();
        if ((node.y - node.r) < 60) {
          repoInfo = [repoInfo.join(", ")]; // collapse to one line
        }
        tooltip.selectAll("tspan")
          .data(repoInfo)
          .enter().append("tspan")
          .text(function(tooltipLine) {return tooltipLine;})
          .attr("x","0") // this will be overwritten below once we know how wide the box is
          .attr("dy", "1.2em");

        tooltipG
          .classed("hidden", false) //unhide
          .attr("transform", "translate(" + node.x + "," + (node.y - node.r) + ")");

        var textRect = tooltip[0][0].getBBox();

        var x = Math.min(Math.max(-textRect.width/2, -node.x), -textRect.width + (diameter - node.x));
        tooltip
          .attr("y", -textRect.height-20)
          .selectAll("tspan")
          .attr("x", x);

        tooltipBackground
          .attr("width", textRect.width+10)
          .attr("height", textRect.height+10)
          .attr("x", textRect.x + x - 5)
          .attr("y", -textRect.height-20);
      }
    }

    function hideToolTip() {
      circles.classed("outlined", false);
      highlightedSVGCircle = null;
      if (isNarrow) {
        tooltip.html("");
      } else {
        tooltipG.classed("hidden", true);
      }
    }

    function addInnerMap(node) {
      if (node.children) {
        hideToolTip();
        createTreeMap(repoMap.fullDict[node.breadcrumbs], node.depth+level, margin + node.x - node.r, margin + node.y - node.r, 2 * node.r);
      } else {
        dispatch({
          type: "SELECT_REPO",
          byName: false,
          repoID: (repoMap.fullDict[node.breadcrumbs].repoID === appState.selectedRepoID) ? null : repoMap.fullDict[node.breadcrumbs].repoID,
          pushHistoryEntry: true
        });
      }
    }

    function remove() {
      hideToolTip();
      innerSVG.remove();
      dispatch({type: "POP_MAP", svgDescription: tooltipText(root)});
    }

    var containerWidth = parseFloat(outerSVG.style("width"));
    var margin = isNarrow ? 5 : 40; // + containerWidth * (1-Math.pow(0.95,level));
    var diameter=containerWidth-2*margin;
    var tooltip;

    var pack = d3.layout.pack()
        .padding(3)
        .size([diameter, diameter])
        .value(function() {return 1;});

    var innerSVG = outerSVG.append("g")
      .datum({name: root.name, breadcrumbs: root.breadcrumbs, svgDescription: tooltipText(root)});

    if (level > 1) {
      innerSVG.attr("class", "innerMap");

      // start small and use d3 transition for zoom effect
      innerSVG
        .attr("transform","translate(" + initialLeft + "," + initialTop + ")"
                          + " scale(" + initialDiameter / diameter + ")");
    } else {
      // start full size
      innerSVG.attr("transform","translate(" + margin + "," + margin + ")");
    }

    innerSVG.append("rect") // block mouse events
      .attr("x", 0).attr("y", 0).attr("width", diameter).attr("height", diameter).attr("fill", "none").attr("pointer-events", "all");

    // d3 is going to mutate the object - make a deep copy before passing it in
    var nodes = pack.nodes(JSON.parse(JSON.stringify(root)));

    var circleG = innerSVG.append("g")
      .attr("class", "circle-container");
    var startTime = Date.now();
    for (var i=0; i < 5; i++) {
      circleG
        .selectAll("circle.depth" + i)
          .data(nodes.filter(function(d) { return d.depth === i; }))
        .enter().append("circle")
          .attr("class", function(d) {
            return d.sanitizedName + " depth" + d.depth + " " +
                  (d.parent ? d.children ? "node" : "node node--leaf" : "node node--root") +
                  (d.children ? " level" + (level + d.depth - 1) : "");
          })
          .attr("r", function(d) {return d.r;})
          .attr("cx", function(d) {return d.x;})
          .attr("cy", function(d) {return d.y;});
      if (i > 1 && (Date.now() - startTime) > 25) {
        // keep page snappy
        break;
      }
    }
    var circles = circleG.selectAll("circle");

    if (isNarrow) {
      circles
        .style("pointer-events", "none")
        .filter(function(d) { return d.depth === 1; })
        .style("pointer-events", "all");
    }

    // Set up events.
    // Mouseover highlights a node.
    // Click highlights a node and immediately expands it.
    // Mouseout un-highlights a node.
    //
    // For an unhighlighted node, touchstart highlights it and
    // sets a timeout to expand it if not cancelled by touchend.
    // If a second touchstart comes in while
    // the first touchstart hasn't ended, the event is tossed.
    // For a highlighted node, touchstart cancels any existing
    // timeout and immediately expands it.
    // touchend and touchcancel cancel any existing timeouts.

    var highlightedSVGCircle=null, timeoutFnID=null, activeTouches=0;
    circles
      .on("mouseover", function(d) {
        showToolTip(d, d3.select(this));
      })
      .on("mouseout", function(d) {
        hideToolTip();
      })
      .on("click", function(d) {
        addInnerMap(d);
      })
      .on("touchstart", function(d) {
        console.log("touch started", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();

        activeTouches++;
        if (activeTouches > 1) {
          return;
        }

        if (highlightedSVGCircle && (highlightedSVGCircle[0][0] === d3.select(this)[0][0])) {
          // if they re-touched the already highlighted circle,
          // cancel existing timeout and immediately expand it
          if (timeoutFnID !== null) {
            clearTimeout(timeoutFnID);
            timeoutFnID = null;
          }
          addInnerMap(d);
        } else {
          // if they touched a new circle, highlight it
          showToolTip(d, d3.select(this));
          timeoutFnID = setTimeout(function() {addInnerMap(d);}, 750);
        }
      })
      .on("touchend", function(d) {
        console.log("touch ended", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();
        activeTouches--;

        if (timeoutFnID !== null) {
          clearTimeout(timeoutFnID);
          timeoutFnID = null;
        }
      })
      .on("touchcancel", function(d) {
        console.log("touch cancelled", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();
        activeTouches--;

        if (timeoutFnID !== null) {
          clearTimeout(timeoutFnID);
          timeoutFnID = null;
        }
      })
      .on("touchmove", function(d) {
        console.log("touch moved", d, d3.event, this);
        d3.event.preventDefault();
        d3.event.stopPropagation();
      });

    if (level > 1) {
      var root_2_over_2 = Math.sqrt(2)/2;
      var cbRadius = diameter * (isNarrow ? 0.06 : 0.03), cbHalfWidth = cbRadius*root_2_over_2;
      var closeButtonG = innerSVG.append("g")
        .attr("class", "closebuttongroup")
        .attr("transform", "translate(" + (diameter/2*(1+root_2_over_2)) + "," + (diameter/2*(1-root_2_over_2)) + ")");

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", -cbHalfWidth)
        .attr("y1", -cbHalfWidth)
        .attr("x2", +cbHalfWidth)
        .attr("y2", +cbHalfWidth);

      closeButtonG.append("line")
        .attr("class", "closebuttonx")
        .attr("x1", -cbHalfWidth)
        .attr("y1", +cbHalfWidth)
        .attr("x2", +cbHalfWidth)
        .attr("y2", -cbHalfWidth);

      closeButtonG.append("circle")
        .attr("class", "closebuttoncircle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", cbRadius)
        .on("click", remove)
        .on("touchstart", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
          remove();
        })
        .on("touchend", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
        })
        .on("touchcancel", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
        })
        .on("touchmove", function() {
          d3.event.stopPropagation();
          d3.event.preventDefault();
        });

      innerSVG.transition().duration(1000)
        .attr("transform", "translate(" + margin + "," + margin + ")");
      dispatch({type: "PUSH_MAP", svgDescription: tooltipText(root)});
    }

    if (isNarrow) {
      tooltip = d3.select("#tooltip-text");
    } else {
      var tooltipG = innerSVG.append("g")
        .attr("class", "tooltipgroup hidden");
      var tooltipBackground = tooltipG.append("rect")
        .attr("class", "tooltipBackground")
        .attr("rx", 5)
        .attr("ry", 5);
      var tooltipTriangle = tooltipG.append("polygon")
        .attr("points", "-10,-10 10,-10 0,-3")
        .attr("class", "tooltipTriangle");

      tooltip = tooltipG.append("text");
    }

  }

  return {
    initApp: initApp,
    repoMap: repoMap,
  };
})();

$(document).ready(function () {
  var edges, nodes, edgesPerNode = {}, starcounts, nodeDict;

  d3_queue.queue(2)
    .defer(d3.json, "data/gitmap.json")
    .awaitAll(function(error, results) {
      if (error) throw error;

      repoTree = results[0].tree;
      edges = results[0].links;

      theApp.initApp(repoTree, edges);

  });
});