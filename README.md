# yar

Yet Another Roadmapping visualization tool.

It's fully client side, but can be accessed for ease of use at: https://roadmap.with.edouard.today
You can host the yaml file in github gist, pastebin, whatever you want that allows the JS to read a yaml file.

## Format

The yaml format was meant to be easy editable with low learning curves:

Each node is defined with a `name`
They can contain optinally many sub `items` (which are other nodes)
There exists some specific properties likes:
- `link`, so you can make the node clickable
- `category`, which allows a subtree to be grouped visually with a box
- `status` which takes: `ready`, `soon`, `notStarted` as possible values



Deployed regularly via cron:
```cron
*/5 * * * * cd $HOME/hosting && ( [ -d yar ] && cd yar && git pull
```

Example.yml
```yaml
name: roadmap
status: ready
items:
  - name: childnode
    status: ready
    category: Build
    items:
      - name: google
        status: soon
        link: google.com
```
