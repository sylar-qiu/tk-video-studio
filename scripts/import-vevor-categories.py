#!/usr/bin/env python3
"""
Import Amazon / VEVOR category tree into tk-video-studio.

Usage:
  python3 scripts/import-vevor-categories.py --db --yes
  python3 scripts/import-vevor-categories.py --yes   # via API (backend on :8000)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from urllib.error import HTTPError

API = os.environ.get("TK_API", "http://127.0.0.1:8000/api")
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

CATEGORIES = [
    ("Outdoors", "户外", [
        ("Lawn & Garden", "草坪花园", ["Garden Decor", "Garden Tools", "Plant Supports", "Garden Arbors", "Garden Structures & Bridges", "Garden Water Features"]),
        ("Outdoor Power Equipment", "户外动力设备", ["Augers", "Chainsaws", "Cultivators & Tillers", "Edgers & Trimmers", "Lawn Mowers", "Leaf Blowers", "Log Splitters", "Outdoor Power Equipment Accessories", "Pressure Washers", "Snow Blowers", "Stump Grinders", "Generator Accessories", "Generators", "Wood Chippers", "Brush Cutters"]),
        ("Watering & Irrigation", "浇水灌溉", ["Drip Irrigation", "Hoses & Accessories", "Lawn Sprinklers", "Soaker Hoses", "Water Timers & Controls", "Watering Wands", "Garden Hoses"]),
        ("Gardening Supplies", "园艺用品", ["Composters", "Greenhouses & Accessories", "Garden Fencing", "Hydroponic Gardening", "Planter Pots & Accessories", "Pest Control", "Plant Stands", "Raised Garden Beds", "Row Covers & Shade", "Seed Starting Supplies", "Garden Netting"]),
        ("Outdoor Decor", "户外装饰", ["Flags & Banners", "Fountains & Water Features", "Garden Lighting", "Garden Statues & Sculptures", "Lawn Ornaments", "Outdoor Clocks", "Outdoor Cushions", "Pond Accessories", "Pond Pumps & Filters", "Solar Lights", "Wind Chimes", "Stepping Stones"]),
        ("Outdoor Cooking", "户外烹饪", ["BBQ Grills & Smokers", "Grill Accessories", "Grill Covers", "Outdoor Griddles", "Outdoor Pizza Ovens", "Portable Grills", "Rotisseries", "Camping Stoves", "Outdoor Kitchen Islands"]),
        ("Patio & Garden", "庭院花园", ["Gazebos & Canopies", "Outdoor Furniture", "Patio Furniture Covers", "Patio Heaters & Fire Pits", "Shade Sails", "Umbrellas & Bases", "Hammocks & Swings", "Outdoor Curtains & Screens"]),
        ("Fencing", "围栏", ["Fence Panels", "Fence Posts & Accessories", "Gate Hardware", "Gates", "Pool Fencing", "Privacy Screens", "Wire Fencing", "Electric Fencing"]),
        ("Pools & Spas", "泳池水疗", ["Above Ground Pools & Accessories", "Inflatable Pools", "Pool Chemical & Testing", "Pool Covers & Reels", "Pool Filters & Pumps", "Pool Heaters", "Pool Liners", "Pool Lighting", "Pool Vacuum & Cleaning", "Hot Tubs & Spas", "Cold Plunge"]),
        ("Pet Supplies", "宠物用品", ["Bird Supplies", "Cat Supplies", "Dog Supplies", "Fish & Aquatics", "Pet Carriers & Travel", "Pet Cleaning", "Pet Fencing", "Pet Houses & Beds", "Small Animal Supplies", "Wildlife Supplies"]),
        ("Hunting & Fishing", "狩猎钓鱼", ["Archery & Crossbows", "Fishing Rods & Reels", "Fishing Accessories", "Hunting Blinds", "Hunting Gear", "Hunting Optics", "Game Calls & Decoys", "Knives & Tools", "Traps & Snares"]),
    ]),
    ("Automotive", "汽车", [
        ("Automotive Tools & Equipment", "汽修工具", ["Diagnostic Tools", "Jacks & Lifts", "Oil Change Equipment", "Brake Service Tools", "Engine Tools", "Transmission Tools", "A/C Service Tools", "Welding Equipment"]),
        ("Car Care & Detailing", "汽车护理", ["Car Wash Soap & Supplies", "Car Wax & Polish", "Detailing Kits", "Interior Cleaners", "Glass Cleaners", "Wheel Cleaners", "Carpet & Upholstery Cleaners", "Pressure Washers & Accessories"]),
        ("Interior Accessories", "内饰配件", ["Car Floor Mats & Liners", "Seat Covers", "Dashboard Covers", "Sun Shades", "Car Organizers", "Steering Wheel Covers", "Pedal Covers", "Phone Mounts"]),
        ("Exterior Accessories", "外饰配件", ["Car Covers", "Bug Deflectors", "Side Steps & Running Boards", "Mud Flaps", "Spoilers & Wings", "Grille Guards & Bull Bars", "Fender Flares", "Roof Racks & Cargo Carriers"]),
        ("Automotive Lighting", "车灯照明", ["Headlights & Assemblies", "Tail Lights", "LED Light Bars", "Fog Lights", "Interior Lights", "Off-Road Lights", "License Plate Lights", "Light Bulbs"]),
        ("Tires & Wheels", "轮胎轮毂", ["Tire Chains", "Tire Pressure Monitoring", "Wheel Locks", "Tire Repair Kits", "Valve Stems & Caps", "Hubcaps & Center Caps"]),
        ("Automotive Fluids & Chemicals", "车用液体", ["Engine Oil", "Transmission Fluid", "Coolant & Antifreeze", "Brake Fluid", "Power Steering Fluid", "Additives", "Fuel System Cleaners", "Grease & Lubricants"]),
        ("Automotive Electrical", "汽车电气", ["Batteries", "Battery Chargers & Maintainers", "Jump Starters", "Alternators", "Starters", "Trailer Wiring", "Switches & Relays", "Fuses & Circuit Breakers"]),
        ("Engine & Drivetrain", "发动机传动", ["Air Intake Systems", "Exhaust Systems", "Engine Parts", "Transmission Parts", "Drive Shafts & Axles", "Clutch Kits", "Fuel Pumps", "Engine Gaskets & Seals"]),
        ("Brakes & Suspension", "刹车悬挂", ["Brake Pads & Shoes", "Brake Rotors", "Brake Calipers", "Brake Lines", "Shocks & Struts", "Control Arms", "Ball Joints", "Suspension Kits"]),
        ("Motorcycle & ATV", "摩托车ATV", ["Motorcycle Parts", "ATV Parts", "Helmets & Gear", "Motorcycle Covers", "ATV Covers", "Battery Chargers", "Motorcycle Lighting", "Saddlebags & Luggage"]),
        ("RV & Trailer", "房车拖车", ["RV Accessories", "RV Covers", "Trailer Hitches", "Trailer Lights & Wiring", "Tow Bars", "Towing Mirrors", "Weight Distribution", "Trailer Jacks"]),
        ("Marine & Boat", "船舶用品", ["Boat Covers", "Marine Electronics", "Marine Lights", "Boat Seats", "Boat Trailer Parts", "Dock Hardware", "Anchor & Docking", "Boat Cleaning"]),
    ]),
    ("Appliances", "家电", [
        ("Refrigerators & Freezers", "冰箱冰柜", ["Refrigerators", "Freezers", "Mini Fridges", "Beverage Coolers & Wine Coolers", "Kegerators", "Ice Makers", "Refrigerator Parts & Accessories"]),
        ("Washers & Dryers", "洗衣机干衣机", ["Washers", "Dryers", "Laundry Centers", "Washer & Dryer Parts", "Laundry Accessories", "Irons & Steamers", "Ironing Boards"]),
        ("Dishwashers", "洗碗机", ["Built-In Dishwashers", "Portable Dishwashers", "Dishwasher Parts", "Dishwasher Detergent", "Dishwasher Racks"]),
        ("Ovens & Ranges", "烤箱灶具", ["Ranges & Cooktops", "Wall Ovens", "Microwaves", "Range Hoods", "Toaster Ovens", "Oven Parts & Accessories", "Cooktop Parts"]),
        ("Small Kitchen Appliances", "小家电", ["Coffee Makers & Espresso", "Air Fryers", "Slow Cookers", "Rice Cookers", "Pressure Cookers", "Blenders & Juicers", "Mixers & Food Processors", "Toasters", "Electric Kettles", "Food Dehydrators", "Meat Grinders", "Vacuum Sealers", "Sous Vide", "Ice Cream Makers", "Waffle Makers", "Bread Makers", "Food Slicers"]),
        ("Vacuum Cleaners & Floor Care", "吸尘器地板护理", ["Upright Vacuums", "Canister Vacuums", "Stick Vacuums", "Robot Vacuums", "Handheld Vacuums", "Carpet Cleaners", "Steam Mops", "Wet/Dry Vacuums", "Vacuum Parts & Accessories", "Floor Polishers"]),
        ("Air Conditioners & Heaters", "空调取暖器", ["Window Air Conditioners", "Portable Air Conditioners", "Mini Split Systems", "Space Heaters", "Wall Heaters", "Heater Parts", "A/C Parts & Accessories"]),
        ("Fans & Air Purifiers", "风扇净化器", ["Ceiling Fans", "Tower Fans", "Pedestal Fans", "Box Fans", "Air Purifiers", "Air Purifier Parts", "Air Filters", "Humidifiers", "Dehumidifiers"]),
        ("Cooking Appliances", "烹饪电器", ["Cooktops (Electric/Gas/Induction)", "Countertop Ovens", "Slow Cookers", "Electric Pressure Cookers", "Griddles & Grills", "Deep Fryers", "Warmers & Food Stations"]),
        ("Sewing Machines", "缝纫机", ["Mechanical Sewing Machines", "Computerized Sewing Machines", "Serger Machines", "Embroidery Machines", "Quilting Machines", "Sewing Machine Parts", "Sewing Accessories"]),
    ]),
    ("Tools", "工具", [
        ("Power Tools", "电动工具", ["Drills & Drivers", "Saws (Circular, Miter, Table)", "Grinders & Sanders", "Routers & Planers", "Nailers & Staplers", "Impact Wrenches", "Rotary Hammers", "Angle Grinders", "Multi-Tools", "Heat Guns", "Power Tool Sets"]),
        ("Hand Tools", "手动工具", ["Wrenches & Ratchets", "Screwdrivers & Sets", "Pliers & Cutters", "Hammers & Mallets", "Saws & Blades", "Measuring & Layout Tools", "Levels", "Tape Measures", "Clamps & Vises", "Chisels & Punches", "Utility Knives", "Tool Sets"]),
        ("Tool Storage", "工具收纳", ["Tool Boxes & Chests", "Tool Bags & Belts", "Tool Cabinets", "Tool Organizers", "Work Benches", "Tool Cart", "Tool Wall Organizers", "Pegboards & Accessories"]),
        ("Welding & Soldering", "焊接工具", ["Welding Machines (MIG/TIG/Stick)", "Welding Helmets", "Welding Gloves", "Welding Wire & Rods", "Plasma Cutters", "Soldering Irons & Stations", "Soldering Accessories", "Brazing Equipment"]),
        ("Air Compressors & Pneumatic Tools", "空压机气动工具", ["Air Compressors", "Air Tools (Impact, Ratchets)", "Air Hose & Fittings", "Air Filter & Lubricator", "Spray Guns", "Nail Guns", "Air Compressor Parts", "Pneumatic Cylinders"]),
        ("Measuring & Layout Tools", "测量工具", ["Laser Levels", "Distance Measurers", "Calipers", "Micrometers", "Angle Finders", "Marking Tools", "Squares", "Stud Finders", "Thermal Imaging"]),
        ("Woodworking Tools", "木工工具", ["Jointers & Planers", "Band Saws", "Lathes", "Dust Collectors", "Router Tables", "Wood Carving Tools", "Chisels & Gouges", "Shapers & Moulders", "Woodworking Clamps"]),
        ("Construction Tools", "施工工具", ["Masonry Tools", "Concrete Tools", "Drywall Tools", "Tiling Tools", "Plastering Tools", "Demolition Tools", "Scaffolding", "Ladders"]),
        ("Metalworking Tools", "金工工具", ["Metal Lathes", "Milling Machines", "Sheet Metal Tools", "Bevelling Tools", "Taps & Dies", "Metal Cutting Saws", "Metal Shears"]),
        ("Fasteners & Hardware", "紧固件五金", ["Screws & Bolts", "Nails & Staples", "Washers & Nuts", "Anchors", "Rivets & Rivet Tools", "Hooks & Hangers", "Magnets & Magnetic Products", "Casters & Wheels"]),
    ]),
    ("Plumbing", "管道", [
        ("Pipe & Fittings", "管道接头", ["PVC Pipe & Fittings", "Copper Pipe & Fittings", "PEX Pipe & Fittings", "Galvanized Pipe", "Pipe Nipples", "Connectors & Couplers", "Pipe Clamps & Hangers"]),
        ("Faucets & Fixtures", "水龙头洁具", ["Kitchen Faucets", "Bathroom Faucets", "Utility Sink Faucets", "Faucet Parts & Cartridges", "Faucet Accessories", "Tub & Shower Faucets", "Soap Dispensers"]),
        ("Water Heaters", "热水器", ["Tank Water Heaters", "Tankless Water Heaters", "Water Heater Parts", "Water Heater Accessories", "Solar Water Heaters", "Thermostats & Elements"]),
        ("Toilets & Bidets", "马桶洁身器", ["Toilets", "Bidets & Bidet Seats", "Toilet Parts & Repair", "Toilet Seats", "Toilet Accessories", "Urinals & Parts"]),
        ("Sinks & Vanities", "洗手盆浴室柜", ["Bathroom Sinks", "Kitchen Sinks", "Utility Sinks", "Vanity Cabinets", "Vanity Tops", "Sink Accessories"]),
        ("Showers & Bathtubs", "花洒浴缸", ["Shower Heads", "Shower Systems", "Shower Doors & Enclosures", "Bathtubs", "Tubs & Showers", "Shower Bases & Pans", "Bathroom Accessories"]),
        ("Drain Cleaning", "管道疏通", ["Drain Snakes & Augers", "Drain Cleaners", "Hydro Jetting", "Drain Parts & Tools", "Toilet Augers", "Grease Traps"]),
        ("Water Pumps", "水泵", ["Utility Pumps", "Submersible Pumps", "Sump Pumps", "Well Pumps", "Booster Pumps", "Dewatering Pumps", "Pump Parts & Accessories", "Pressure Tanks"]),
        ("Water Filtration", "水过滤", ["Whole House Filters", "Under Sink Filters", "Countertop Filters", "Filter Replacement Cartridges", "Water Softeners", "Reverse Osmosis Systems", "Water Test Kits"]),
        ("Plumbing Tools", "管道工具", ["Pipe Wrenches", "Plungers", "Plumbing Snakes", "Pipe Cutters", "Tubing Tools", "Crimping Tools", "Threading Tools", "Propane Torches"]),
    ]),
    ("Building Materials", "建材", [
        ("Lumber & Composite", "木材复合材料", ["Lumber & Plywood", "Composite Decking", "PVC Trim & Moulding", "Furring Strips", "Pressure Treated Lumber", "Hardwood Boards"]),
        ("Drywall & Ceiling", "石膏板吊顶", ["Drywall Sheets", "Drywall Tools", "Ceiling Tiles", "Ceiling Grid Systems", "Corner Bead", "Drywall Compound", "Drywall Tape"]),
        ("Insulation", "保温隔热", ["Fiberglass Insulation", "Foam Board Insulation", "Spray Foam", "Radiant Barrier", "Insulation Accessories", "Weather Stripping"]),
        ("Roofing", "屋顶材料", ["Asphalt Shingles", "Metal Roofing", "Roof Underlayment", "Roof Flashing", "Gutter Systems", "Roof Ventilation", "Roofing Tools"]),
        ("Concrete & Masonry", "混凝土砌体", ["Cement Mix", "Concrete Mix", "Mortar Mix", "Concrete Forms", "Rebar & Wire Mesh", "Masonry Blocks & Bricks", "Concrete Tools", "Concrete Sealers"]),
        ("Flooring", "地板", ["Laminate Flooring", "Vinyl Flooring", "Hardwood Flooring", "Tile Flooring", "Carpet & Rugs", "Flooring Underlayment", "Flooring Tools & Accessories", "Gym Flooring"]),
        ("Moulding & Millwork", "线条木作", ["Baseboard Moulding", "Crown Moulding", "Chair Rail", "Casing & Door Frame", "Panel Moulding", "Wainscoting", "Columns & Posts"]),
        ("Cabinets & Countertops", "橱柜台面", ["Kitchen Cabinets", "Bathroom Cabinets", "Cabinet Hardware", "Countertops & Tops", "Cabinet Parts & Accessories"]),
        ("Painting & Supplies", "油漆涂料", ["Paint (Interior/Exterior)", "Primers", "Paint Brushes & Rollers", "Paint Sprayers", "Paint Trays & Liners", "Drop Cloths", "Painter's Tape", "Wood Stain & Sealers"]),
        ("Hardware & Fasteners", "五金紧固件", ["Door Hardware", "Cabinet Hardware", "Screws & Anchors", "Nuts & Bolts", "Hinges & Latches", "Corner Braces", "Shelving Brackets"]),
        ("Sealants & Adhesives", "密封胶粘合剂", ["Silicone Sealants", "Construction Adhesive", "Epoxy", "Caulk & Caulking Guns", "Spray Adhesive", "Contact Cement", "Gorilla Glue"]),
        ("Scaffolding & Ladders", "梯子脚手架", ["Step Ladders", "Extension Ladders", "Multi-Position Ladders", "Scaffolding Sets", "Scaffolding Planks", "Scaffolding Wheels", "Attic Ladders"]),
    ]),
    ("Sports & Outdoors", "运动户外", [
        ("Camping & Hiking", "露营徒步", ["Tents", "Sleeping Bags & Pads", "Camping Furniture", "Stoves & Cookware", "Coolers & Ice Chests", "Camping Lights & Lanterns", "Backpacks", "Hydration Packs", "Navigation & GPS"]),
        ("Fitness & Exercise", "健身器材", ["Treadmills", "Exercise Bikes", "Elliptical Trainers", "Rowing Machines", "Weight Benches", "Dumbbells & Barbells", "Kettlebells", "Resistance Bands", "Home Gyms", "Yoga Mats & Equipment", "Foam Rollers", "Jump Ropes"]),
        ("Cycling", "骑行", ["Bikes (Mountain, Road, Electric)", "Bike Parts & Accessories", "Helmets", "Bike Lights", "Bike Locks", "Bike Racks & Carriers", "Cycling Apparel"]),
        ("Water Sports", "水上运动", ["Kayaks & Canoes", "Paddleboards", "Paddles & Oars", "Life Jackets & PFDs", "Wetsuits & Rashguards", "Snorkeling & Diving", "Water Toys & Tubes"]),
        ("Winter Sports", "冬季运动", ["Snowboards & Skis", "Sleds & Snow Tubes", "Winter Clothing", "Ski & Snowboard Gear", "Ice Skates", "Snowshoeing"]),
        ("Team Sports", "团体运动", ["Soccer Equipment", "Basketball Equipment", "Volleyball Equipment", "Football Equipment", "Baseball & Softball", "Hockey Equipment", "Goal Posts & Nets"]),
        ("Hunting & Shooting", "狩猎射击", ["Gun Safes & Cases", "Ammunition Storage", "Shooting Targets", "Hunting Blinds", "Game Cameras", "Hunting Apparel", "Binoculars & Scopes", "Range Finders"]),
        ("Fishing", "钓鱼", ["Fishing Rods", "Fishing Reels", "Fishing Line", "Fishing Lures & Baits", "Tackle Boxes", "Fishing Nets & Tools", "Fishing Accessories", "Ice Fishing Gear"]),
        ("Recreation & Games", "休闲游戏", ["Trampolines & Accessories", "Playground Equipment", "Bounce Houses", "Sport Nets & Equipment", "Foosball Tables", "Air Hockey", "Pool Tables", "Dartboards", "Yard Games"]),
    ]),
    ("Heating, Venting & Cooling", "暖通空调", [
        ("Air Conditioners", "空调", ["Window A/C Units", "Portable A/C Units", "Mini Split Systems", "Central A/C Parts", "A/C Remote Controls", "A/C Covers"]),
        ("Heaters & Space Heaters", "取暖器", ["Space Heaters", "Wall Heaters", "Baseboard Heaters", "Radiant Heaters", "Heater Parts & Accessories", "Thermostats", "Fireplace Inserts"]),
        ("Fans & Ventilation", "风扇通风", ["Ceiling Fans", "Stand Fans", "Tower Fans", "Wall-Mount Fans", "Exhaust Fans", "Attic Fans", "Ventilation Systems", "Range Hoods", "Bathroom Fans"]),
        ("Thermostats & Controls", "温控器", ["Programmable Thermostats", "Smart Thermostats", "Thermostat Parts", "Zone Control Systems", "Radiator Valves", "Temperature Sensors"]),
        ("Ducts & Venting", "风管通风管", ["Flexible Duct", "Duct Connectors", "Duct Tape", "Vent Covers & Grilles", "Dryer Vents", "Register & Diffuser", "Duct Insulation"]),
        ("Air Quality & Purifiers", "空气净化", ["Air Purifiers", "Air Purifier Filters", "Ozone Generators", "Air Quality Monitors", "Humidifiers", "Dehumidifiers", "Air Filter Media"]),
        ("Boilers & Hydronics", "锅炉热水系统", ["Boilers", "Radiators", "Pumps & Circulators", "Expansion Tanks", "Boiler Parts", "Hydronic Controls", "Pex Tubing & Fittings"]),
        ("Heat Pumps", "热泵", ["Air Source Heat Pumps", "Heat Pump Parts", "Mini Split Heat Pumps", "Heat Pump Thermostats", "Geothermal Parts"]),
        ("Fireplaces & Stoves", "壁炉火炉", ["Electric Fireplaces", "Gas Fireplaces", "Pellet Stoves", "Wood Stoves", "Fireplace Mantels", "Fireplace Inserts", "Chimney & Flue"]),
    ]),
    ("Electrical", "电气", [
        ("Switches & Outlets", "开关插座", ["Light Switches", "Electrical Outlets", "GFCI Outlets", "USB Outlets", "Switch & Outlet Covers", "Dimmers", "Motion Sensor Switches"]),
        ("Light Fixtures", "灯具", ["Ceiling Lights", "Chandeliers & Pendants", "Wall Sconces", "Track Lighting", "Recessed Lighting", "Under Cabinet Lights", "Outdoor Lights", "Landscape Lighting", "Bathroom Lighting"]),
        ("Light Bulbs & LEDs", "灯泡LED", ["LED Bulbs", "Incandescent Bulbs", "Halogen Bulbs", "Smart Bulbs", "Night Lights", "Light Strings & Rope Lights", "Bulb Adapters"]),
        ("Electrical Panels & Breakers", "配电箱断路器", ["Breaker Boxes", "Circuit Breakers", "Fuses", "Load Centers", "Breaker Accessories", "Meter Sockets", "Sub Panels"]),
        ("Wires & Cables", "电线电缆", ["Building Wire (Romex)", "Extension Cords", "Power Cords", "Speaker Wire", "Coaxial Cable", "Ethernet Cable", "Cable Management", "Wire Connectors"]),
        ("Conduit & Fittings", "线管配件", ["Conduit (EMT, PVC, Flexible)", "Conduit Fittings", "Conduit Bodies", "Cable Tray", "Cable Ties", "Wire Markers", "Heat Shrink Tubing"]),
        ("Batteries & Chargers", "电池充电器", ["Alkaline Batteries", "Lithium Batteries", "Rechargeable Batteries", "Battery Chargers", "Power Banks", "Battery Testers", "UPS Battery Backup"]),
        ("Power Strips & Surge Protectors", "排插浪涌保护", ["Power Strips", "Surge Protectors", "UPS Uninterruptible Power", "Power Distribution Units", "USB Power Hubs"]),
        ("Transformers & Power Supplies", "变压器电源", ["AC/DC Power Supplies", "LED Drivers", "Transformers", "Power Adapters", "Battery Eliminators", "Voltage Converters"]),
        ("Solar & Renewable Energy", "太阳能", ["Solar Panels", "Solar Charge Controllers", "Solar Inverters", "Solar Battery Kits", "Solar Accessories", "Wind Turbines", "EV Chargers"]),
    ]),
    ("Storage & Organization", "存储收纳", [
        ("Shelving & Racks", "货架架子", ["Freestanding Shelves", "Wall Shelves", "Heavy Duty Shelving", "Wire Shelving", "Storage Racks", "Garage Shelving", "Pallet Racks", "Corner Shelves"]),
        ("Cabinets & Storage Furniture", "储物柜", ["Storage Cabinets", "Tool Chests", "Drawer Cabinets", "Lockers", "Sideboards & Buffets", "Entryway Storage", "Media Storage"]),
        ("Garage Storage", "车库收纳", ["Garage Shelf & Rack", "Wall Panels & Slatwall", "Ceiling Storage", "Garage Bikes Racks", "Workbenches", "Garage Cabinets", "Utility Sink & Counter"]),
        ("Closet Organization", "衣柜收纳", ["Closet Systems", "Closet Rods & Hooks", "Shoe Racks & Organizers", "Hangers", "Storage Bags & Boxes", "Drawer Dividers", "Jewelry Organizers"]),
        ("Kitchen Storage", "厨房收纳", ["Pantry Organizers", "Cabinet Organizers", "Countertop Organizers", "Spice Racks", "Pot Racks & Pan Organizers", "Under Sink Organizers", "Drawer Organizers"]),
        ("Office Organization", "办公收纳", ["Desk Organizers", "File Cabinets", "Paper Trays & Sorters", "Pen Holders", "Monitor Stands", "Bookcases", "Magazine Racks"]),
        ("Laundry Storage", "洗衣收纳", ["Laundry Hampers & Baskets", "Drying Racks", "Laundry Carts", "Ironing Boards & Covers", "Laundry Room Cabinets"]),
        ("Bins & Baskets", "收纳箱篮", ["Storage Bins & Totes", "Baskets", "Trash Cans & Recycling", "Plastic Storage Drawers", "Lidded Boxes", "Decorative Boxes"]),
        ("Moving & Shipping", "搬家物流", ["Moving Boxes", "Packing Tape & Dispensers", "Bubble Wrap & Padding", "Lifting Straps", "Dollies & Hand Trucks", "Wardrobe Boxes"]),
    ]),
    ("Kitchen", "厨房", [
        ("Cookware", "锅具", ["Frying Pans & Skillets", "Saucepans & Pots", "Stockpots & Dutch Ovens", "Woks & Stir Fry Pans", "Grill Pans & Griddles", "Cookware Sets", "Roasting Pans", "Steamers & Inserts"]),
        ("Bakeware", "烘焙用具", ["Baking Sheets & Pans", "Cake Pans & Muffin Pans", "Bread Pans", "Casserole Dishes", "Pie Plates", "Bundt Pans", "Baking Tools & Accessories"]),
        ("Kitchen Utensils", "厨房工具", ["Knives & Cutting Boards", "Spatulas & Turners", "Ladles & Serving Spoons", "Tongs & Whisks", "Peelers & Graters", "Measuring Cups & Spoons", "Colanders & Strainers", "Can Openers & Peelers"]),
        ("Cutlery & Knife Sets", "刀具套装", ["Chef's Knives", "Paring Knives", "Boning Knives", "Bread Knives", "Knife Blocks & Storage", "Knife Sharpeners", "Cutlery Sets", "Steak Knives"]),
        ("Food Storage", "食品储存", ["Food Storage Containers", "Glass Food Storage", "Canisters & Jars", "Vacuum Sealer Bags", "Mason Jars", "Lunch Boxes & Bags", "Water Bottles"]),
        ("Dinnerware & Serving", "餐具", ["Dinner Plates & Bowls", "Drinkware & Glassware", "Mugs & Cups", "Serving Platters & Trays", "Serving Bowls", "Salt & Pepper Shakers", "Table Linens", "Placemats & Runners"]),
        ("Drinkware & Bar", "水具酒具", ["Water Glasses & Tumblers", "Wine Glasses", "Beer Glasses & Mugs", "Coffee Mugs", "Tea Cups & Sets", "Barware & Cocktail Tools", "Decanters & Carafes", "Wine Accessories"]),
        ("Kitchen Gadgets", "厨房小工具", ["Kitchen Timers", "Food Scales", "Thermometers", "Oil Sprayers", "Garlic Presses & Choppers", "Egg Slicers & Tools", "Kitchen Shears", "Mandoline Slicers"]),
        ("Kitchen Sinks & Faucets", "厨房水槽龙头", ["Kitchen Sinks", "Kitchen Faucets", "Soap Dispensers", "Water Filters & Faucets", "Kitchen Sink Accessories", "Garbage Disposals"]),
        ("Kitchen Textiles", "厨房纺织品", ["Kitchen Towels", "Oven Mitts & Pot Holders", "Aprons", "Dishcloths", "Placemats", "Tablecloths & Runners", "Chair Covers"]),
    ]),
    ("Furniture", "家具", [
        ("Living Room Furniture", "客厅家具", ["Sofas & Couches", "Loveseats", "Sectionals", "Coffee Tables", "End Tables", "TV Stands & Entertainment Centers", "Recliners & Accent Chairs", "Ottomans & Benches", "Sleeper Sofas"]),
        ("Bedroom Furniture", "卧室家具", ["Bed Frames & Platform Beds", "Mattresses", "Nightstands", "Dressers & Chests", "Armoires & Wardrobes", "Headboards & Footboards", "Vanities & Benches", "Bedroom Sets"]),
        ("Dining Room Furniture", "餐厅家具", ["Dining Tables", "Dining Chairs", "Bar Stools & Counter Stools", "Buffets & Sideboards", "China Cabinets & Hutches", "Kitchen Islands & Carts", "Dining Sets"]),
        ("Home Office Furniture", "办公家具", ["Desks & Computer Desks", "Office Chairs", "Bookshelves", "Filing Cabinets", "Office Sets", "Standing Desks", "Desk Accessories"]),
        ("Outdoor Furniture", "户外家具", ["Patio Sets", "Outdoor Chairs & Seating", "Outdoor Tables", "Outdoor Benches", "Porch Swings", "Adirondack Chairs", "Outdoor Sectionals", "Outdoor Furniture Covers"]),
        ("Entryway Furniture", "玄关家具", ["Console Tables", "Hall Trees & Coat Racks", "Shoe Benches", "Umbrella Stands", "Entryway Storage", "Mirrors"]),
        ("Kids Furniture", "儿童家具", ["Kids Beds & Bunk Beds", "Kids Desks & Chairs", "Kids Storage & Shelves", "Bookshelves", "Toy Boxes & Storage", "Kids Tables & Chairs", "Nursery Furniture"]),
        ("Accent Furniture", "装饰家具", ["Accent Tables", "Folding Chairs & Tables", "Room Dividers & Screens", "Etagere & Shelving", "Trunks & Chests", "Magazine Racks"]),
        ("Furniture Hardware", "家具五金", ["Drawer Slides", "Cabinet Hinges", "Castors & Wheels", "Furniture Handles & Knobs", "Legs & Feet", "Furniture Connectors", "Shelf Supports"]),
    ]),
]

UNCATEGORIZED_NAME = "未分类"


def label(en: str, cn: str) -> str:
    return f"{en}（{cn}）"


def leaf_label(en: str) -> str:
    return f"{en}（{en}）"


def flatten_api_nodes(nodes: list[dict]) -> list[dict]:
    result: list[dict] = []
    for node in nodes:
        result.extend(flatten_api_nodes(node.get("children", [])))
        result.append(node)
    return result


def api_request(method: str, path: str, data: dict | None = None):
    url = f"{API}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as exc:
        print(f"  ⚠️ {method} {path} -> {exc.code}")
        return None


def clear_categories_db() -> None:
    sys.path.insert(0, str(BACKEND))
    from database import SessionLocal
    from models import Product, ProductCategory

    db = SessionLocal()
    try:
        for product in db.query(Product).all():
            product.category_id = None
        db.commit()

        while db.query(ProductCategory).count():
            leaves = []
            for cat in db.query(ProductCategory).all():
                has_child = (
                    db.query(ProductCategory)
                    .filter(ProductCategory.parent_id == cat.id)
                    .count()
                    > 0
                )
                if not has_child:
                    leaves.append(cat)
            if not leaves:
                raise RuntimeError("Failed to clear categories: cyclic or blocked tree")
            for cat in leaves:
                db.delete(cat)
            db.commit()
    finally:
        db.close()


def import_categories_db() -> int:
    sys.path.insert(0, str(BACKEND))
    from database import SessionLocal
    from models import Product, ProductCategory

    db = SessionLocal()
    count = 0
    try:
        for i, (en, cn, children) in enumerate(CATEGORIES):
            top = ProductCategory(name=label(en, cn), parent_id=None, sort_order=i)
            db.add(top)
            db.flush()
            count += 1
            for j, (c_en, c_cn, grandchildren) in enumerate(children):
                child = ProductCategory(
                    name=label(c_en, c_cn),
                    parent_id=top.id,
                    sort_order=j,
                )
                db.add(child)
                db.flush()
                count += 1
                for k, g_en in enumerate(grandchildren):
                    db.add(
                        ProductCategory(
                            name=leaf_label(g_en),
                            parent_id=child.id,
                            sort_order=k,
                        )
                    )
                    count += 1

        uncategorized = ProductCategory(name=UNCATEGORIZED_NAME, parent_id=None, sort_order=9999)
        db.add(uncategorized)
        db.flush()
        count += 1
        for product in db.query(Product).filter(Product.category_id.is_(None)).all():
            product.category_id = uncategorized.id

        db.commit()
        return count
    finally:
        db.close()


def import_categories_api() -> int:
    count = 0
    uncategorized = api_request("POST", "/categories", {"name": UNCATEGORIZED_NAME, "sort_order": 9999})
    if not uncategorized:
        return 0

    for i, (en, cn, children) in enumerate(CATEGORIES):
        top = api_request("POST", "/categories", {"name": label(en, cn), "sort_order": i})
        if not top:
            continue
        count += 1
        for j, (c_en, c_cn, grandchildren) in enumerate(children):
            child = api_request(
                "POST",
                "/categories",
                {"name": label(c_en, c_cn), "parent_id": top["id"], "sort_order": j},
            )
            if not child:
                continue
            count += 1
            for k, g_en in enumerate(grandchildren):
                row = api_request(
                    "POST",
                    "/categories",
                    {"name": leaf_label(g_en), "parent_id": child["id"], "sort_order": k},
                )
                if row:
                    count += 1
    return count


def clear_categories_api() -> None:
    while True:
        cats = api_request("GET", "/categories")
        if not cats:
            return
        for node in flatten_api_nodes(cats):
            api_request("DELETE", f"/categories/{node['id']}")
        remaining = api_request("GET", "/categories")
        if not remaining:
            return
        clear_categories_db()
        return


def count_expected() -> int:
    total = 1  # 未分类
    for _, _, children in CATEGORIES:
        total += 1
        for _, _, grandchildren in children:
            total += 1 + len(grandchildren)
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Amazon / VEVOR categories")
    parser.add_argument("--db", action="store_true", help="Import via database (no running API)")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    expected = count_expected()
    print(f"Will import {len(CATEGORIES)} top-level groups, ~{expected} category nodes (incl. {UNCATEGORIZED_NAME}).")

    if not args.db:
        cats = api_request("GET", "/categories")
        if cats is None:
            print("Backend not reachable. Use --db or start server on port 8000.")
            return 1
        current = len(flatten_api_nodes(cats))
        print(f"Current categories: {current} nodes")
    else:
        sys.path.insert(0, str(BACKEND))
        from database import SessionLocal
        from models import ProductCategory

        db = SessionLocal()
        try:
            current = db.query(ProductCategory).count()
        finally:
            db.close()
        print(f"Current categories: {current} nodes")

    if not args.yes:
        ans = input("Delete all existing categories and re-import? (y/N): ").strip().lower()
        if ans != "y":
            print("Aborted.")
            return 0

    print("Clearing existing categories…")
    if args.db:
        clear_categories_db()
    else:
        clear_categories_api()

    print("Importing Amazon category tree…")
    imported = import_categories_db() if args.db else import_categories_api()

    if args.db:
        sys.path.insert(0, str(BACKEND))
        from database import SessionLocal
        from models import ProductCategory

        db = SessionLocal()
        try:
            final = db.query(ProductCategory).count()
        finally:
            db.close()
    else:
        cats = api_request("GET", "/categories") or []
        final = len(flatten_api_nodes(cats))

    print(f"Done. Imported {imported} nodes, database now has {final} categories.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
