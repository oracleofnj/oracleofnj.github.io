var qt;

$(document).ready(function () {
  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = 800 - margin.left - margin.right,
      height = 800 - margin.top - margin.bottom;

  var x = d3.scale.linear()
      .range([0, width]);

  var y = d3.scale.linear()
      .range([height, 0]);

  var zoom = d3.behavior.zoom()
      .scaleExtent([1, 10])
      .on("zoom", zoomed);

  var svg = d3.select("#scatter")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
      .call(zoom);

  var rect = svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", function(){return tooltip.style("visibility", "visible");})
      .on("mousemove", hover)
      .on("mouseout", function(){return tooltip.style("visibility", "hidden");});

  var container = svg.append("g")
      .attr("id", "scatter_g");

  var tooltip = d3.select("body")
    .append("div")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("visibility", "hidden")
    .text("");

  function hover() {
    var selectedRepo = qt.find(d3.mouse(container[0][0])).repo;
    var owner = selectedRepo.split("/")[0];
    var relatedReposSameOwner = edgesPerNode[selectedRepo].filter(function(x) {
      return x.otherRepo.split("/")[0] === owner;
    }).sort(function(a,b) {return (a.otherRepo > b.otherRepo) ? 1 : ((a.otherRepo < b.otherRepo) ? -1 : 0);});
    var relatedReposOtherOwner = edgesPerNode[selectedRepo].filter(function(x) {
        return x.otherRepo.split("/")[0] !== owner;
    }).sort(function(a,b) {return (a.otherRepo > b.otherRepo) ? 1 : ((a.otherRepo < b.otherRepo) ? -1 : 0);})
    tooltip.text(selectedRepo);
    container.selectAll(".edge").remove();
    container.selectAll(".edge")
      .data(relatedReposSameOwner.concat(relatedReposOtherOwner), function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
      .enter().append("line")
      .attr("class", "edge")
      .attr("x1", function(d) {return x(d.edgeInfo.x1); })
      .attr("y1", function(d) {return y(d.edgeInfo.y1); })
      .attr("x2", function(d) {return x(d.edgeInfo.x2); })
      .attr("y2", function(d) {return y(d.edgeInfo.y2); });

    d3.select("#selected-repo").text(selectedRepo);

    d3.select("#related-repos-same-owner").selectAll(".related-repo").remove();
    d3.select("#related-repos-same-owner").selectAll(".related-repo")
      .data(relatedReposSameOwner, function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
      .enter().append("p")
      .attr("class", "related-repo same-owner")
      .text(function(d) {return d.otherRepo;});

    d3.select("#related-repos-other-owner").selectAll(".related-repo").remove();
    d3.select("#related-repos-other-owner").selectAll(".related-repo")
      .data(relatedReposOtherOwner, function(edge) {return selectedRepo + "<--->" + edge.otherRepo;})
      .enter().append("p")
      .attr("class", "related-repo other-owner")
      .text(function(d) {return d.otherRepo;});

    return tooltip.style("top",
      (d3.event.pageY-10)+"px").style("left",(d3.event.pageX+10)+"px");
  }

  function zoomed() {
    container.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    container.selectAll(".dot")
      .attr("r", 2.0/Math.sqrt(d3.event.scale));
    container.selectAll(".edge")
      .style("stroke-width", 1.0/Math.sqrt(d3.event.scale));
  }

  var edgesPerNode = {};

  d3.json("data/gephi_output.json", function(error, gephi) {
    if (error) throw error;

    var nodes = Object.keys(gephi.nodes).map(function(repo) {
      edgesPerNode[repo] = [];
      return {"repo": repo, "x": gephi.nodes[repo].x, "y": gephi.nodes[repo].y};
    });
    var edges = gephi.edges;
    edges.forEach(function(edge) {
      edgeInfo = {
        "x1": gephi.nodes[edge.source].x,
        "y1": gephi.nodes[edge.source].y,
        "x2": gephi.nodes[edge.target].x,
        "y2": gephi.nodes[edge.target].y
      }
      edgesPerNode[edge.source].push({"otherRepo": edge.target, "edgeInfo": edgeInfo});
      edgesPerNode[edge.target].push({"otherRepo": edge.source, "edgeInfo": edgeInfo});
    });


    x.domain(d3.extent(nodes, function(d) { return d.x; })).nice();
    y.domain(d3.extent(nodes, function(d) { return d.y; })).nice();

    qt = d3.geom.quadtree(nodes.map(function(repo) {
      return {"repo": repo.repo, "x": x(repo.x), "y": y(repo.y)};
    }));

    container.selectAll(".dot")
        .data(nodes)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("r", 2)
        .attr("cx", function(d) { return x(d.x); })
        .attr("cy", function(d) { return y(d.y); });

  });


});
